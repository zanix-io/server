import { applyMiddlewaresToTarget } from 'middlewares/decorators/assembly.ts'
import { buildGqlInput, scalarTypes } from 'handlers/graphql/types.ts'
import { gqlSchemaDefinitions } from '../schema.ts'
import { getTargetKey } from 'utils/targets.ts'
import Program from 'modules/program/main.ts'
import { ZanixResolver } from '../base.ts'
import { capitalize } from '@zanix/helpers'
import { JSON_CONTENT_HEADER } from 'utils/constants.ts'
import { rootValue } from '../handler.ts'

/** Define decorator to register a route for handler gql */
export function defineResolverDecorator(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  let prefix: string = ''
  let interactor: string | undefined
  if (typeof options === 'string') {
    prefix = options
  } else if (options) {
    interactor = getTargetKey(options.Interactor)
    prefix = options.prefix || prefix
  }

  return function (Target) {
    if (!(Target.prototype instanceof ZanixResolver)) {
      throw new Deno.errors.Interrupted(
        `'${Target.name}' is not a valid Resolver. Please extend ${ZanixResolver.name}`,
      )
    }

    applyMiddlewaresToTarget(Target)

    const methodDecorators = Program.decorators.getDecoratorsData('resolver')

    methodDecorators.forEach((decorator) => {
      const { name, handler, input, output, request, description } = decorator
      const resolverName = prefix ? prefix + capitalize(name) : name.toLowerCase()

      gqlSchemaDefinitions[request] += `\n"""${description}"""\n${resolverName}${
        buildGqlInput(input)
      }: ${output}\n`

      const middlewares = Program.middlewares.getMiddlewares('graphql', {
        Target,
        propertyKey: name,
      })

      const pipes = Array.from(middlewares.pipes)
      const interceptors = Array.from(middlewares.interceptors)

      rootValue[resolverName] = async function (this: typeof rootValue, payload) {
        await Promise.all(pipes.map((pipe) => pipe(this._context)))

        delete this._context.payload.body
        const { key, type } = Target.prototype['_znxProps']
        const instance: ZanixResolver = Program.targets.getInstance(key, type, {
          ctx: this._context,
        })

        const handlerResponse = handler.call(instance, payload, this._context)

        let response: Response
        if (typeof handlerResponse === 'string') response = new Response(handlerResponse)
        else if (handlerResponse instanceof Response) response = handlerResponse
        else {response = new Response(JSON.stringify(handlerResponse), {
            headers: JSON_CONTENT_HEADER,
          })}

        for await (const interceptor of interceptors) {
          response = await interceptor(this._context, response) // execute interceptors secuentially
        }

        this._response = response

        if (response.headers.get('Content-Type') === JSON_CONTENT_HEADER['Content-Type']) {
          return response.json()
        }
        return response.text()
      }
    })

    Program.decorators.deleteDecorators('resolver')

    Program.targets.toBeInstanced(getTargetKey(Target), {
      type: 'resolver',
      Target,
      dataProps: { interactor },
      lifetime: 'TRANSIENT',
    })
  }
}

/** Define decorator to register a resolver request */
export function defineResolverRequestDecorator(
  request: ResolverTypes,
  options: ResolverRequestOptions = {},
): ZanixMethodDecorator {
  return function (method) {
    const name = options.name || method.name.toString()
    const { input, output = scalarTypes.unknown.name, description = `${name} ${request}` } = options
    Program.decorators.addDecoratorData({
      name,
      handler: method,
      request,
      input,
      output,
      description,
    }, 'resolver')
  }
}
