import type { HandlerTypes } from 'typings/program.ts'
import type { HandlerFunction } from 'typings/router.ts'
import type { HandlerContext } from 'typings/context.ts'
import type {
  HandlerDecoratorOptions,
  ResolverRequestOptions,
  ResolverTypes,
  ZanixClassDecorator,
  ZanixMethodDecorator,
} from 'typings/decorators.ts'

import type { VersionProtocolOption } from 'middlewares/protocol-version.ts'

import {
  applyMiddlewaresToTarget,
  applyVersionProtocolToTarget,
} from 'middlewares/decorators/assembly.ts'
import { buildGqlInput, scalarTypes } from 'handlers/graphql/types.ts'
import { asyncContext } from 'modules/infra/base/storage.ts'
import { gqlSchemaDefinitions } from '../schema.ts'
import { getTargetKey } from 'utils/targets.ts'
import { ZanixResolver } from '../base.ts'
import { capitalize } from '@zanix/helpers'
import { ZANIX_PROPS } from 'utils/constants.ts'
import { getRootValueBucket, type RequestContext } from '../handler.ts'
import ProgramModule from 'modules/program/mod.ts'
import { InternalError } from '@zanix/errors'
import { plainResponseInterceptor } from 'middlewares/defaults/response.interceptor.ts'
import { mainGuard, mainInterceptor, mainPipe } from 'middlewares/defaults/main.middlewares.ts'

/** Define decorator to register a route for handler gql */
export function defineResolverDecorator(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  let prefix: string = ''
  let interactor: string | undefined
  let enableALS = false
  let versionProtocol: VersionProtocolOption | undefined
  if (typeof options === 'string') {
    prefix = options
  } else if (options) {
    interactor = getTargetKey(options.Interactor)
    enableALS = options.enableALS || enableALS
    prefix = options.prefix || prefix
    versionProtocol = options.versionProtocol
  }

  // Resolved once, at class-decoration time — the same instant `RouteContainer.defineRoute` would
  // resolve it for a `@Controller`/`@Socket`, so a `@Resolver` is attributed to whichever
  // Application composition scope (`ApplicationContainer.define`) is active the same way.
  const application = ProgramModule.applications.getCurrent()

  return function (Target) {
    if (!(Target.prototype instanceof ZanixResolver)) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid Resolver. Please extend ${ZanixResolver.name}`,
        { meta: { target: Target.name, baseTarget: ZanixResolver.name } },
      )
    }

    applyMiddlewaresToTarget(Target)
    applyVersionProtocolToTarget(Target, versionProtocol)

    const methodDecorators = ProgramModule.decorators.getDecoratorsData('resolver')

    methodDecorators.forEach((decorator) => {
      const { name, handler, input, output, request, description } = decorator
      const resolverName = prefix ? prefix + capitalize(name) : name.toLowerCase()
      const schemaBucket = gqlSchemaDefinitions[application] ??= { Query: '', Mutation: '' }

      schemaBucket[request] += `\n"""${description}"""\n${resolverName}${
        buildGqlInput(input)
      }: ${output}\n`

      const middlewares = ProgramModule.middlewares.getMiddlewares('graphql', {
        Target,
        propertyKey: name,
      })

      const guards = Array.from(middlewares.guards)
      const pipes = Array.from(middlewares.pipes)
      const interceptors = Array.from(middlewares.interceptors)

      // Resolver handler definition
      const resolver: HandlerFunction = async function (
        payload,
        request: RequestContext,
      ) {
        const { key, type } = Target.prototype[ZANIX_PROPS]
        const { context } = request

        // Only execute Target guards that could not be executed due to a single GQL route
        const { headers, response: guardResponse } = await mainGuard(context, guards)
        if (guardResponse) {
          request.response = guardResponse
          return plainResponseInterceptor(context, guardResponse)
        }

        // Only execute Target pipes that could not be executed due to a single GQL route
        await mainPipe(context, pipes)

        delete context.payload.body

        // Handler instance
        const instance = ProgramModule.targets.getHandler<ZanixResolver>(
          key,
          type as HandlerTypes,
          context,
        )

        const handlerFn = (ctx: HandlerContext) => handler.call(instance, payload, ctx)

        // Only execute Target interceptor that could not be executed due to a single GQL route
        const response = await mainInterceptor(context, null as never, {
          handler: handlerFn,
          interceptors,
          headers,
        })

        request.response = response

        return plainResponseInterceptor(context, response)
      }

      // Resolver assignment
      getRootValueBucket(application)[resolverName] = function (
        payload,
        request: RequestContext,
      ) {
        const { data } = Target.prototype[ZANIX_PROPS]
        const { context } = request

        if (!data.enableALS) return resolver(payload, request)

        return asyncContext.runWith(context.id, () => {
          return resolver(payload, request)
        })
      }
    })

    ProgramModule.decorators.deleteDecorators('resolver')
    ProgramModule.sessions.recordApplication(application)

    ProgramModule.targets.defineTarget(getTargetKey(Target), {
      type: 'resolver',
      Target,
      dataProps: { interactor, enableALS, application },
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
    ProgramModule.decorators.addDecoratorData({
      name,
      handler: method,
      request,
      input,
      output,
      description,
    }, 'resolver')
  }
}
