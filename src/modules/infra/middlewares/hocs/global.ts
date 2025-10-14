import type {
  MiddlewareGlobalInterceptor,
  MiddlewareGlobalPipe,
  MiddlewareInterceptor,
  MiddlewarePipe,
} from 'typings/middlewares.ts'
import type {
  ZanixInteractorClass,
  ZanixInteractorGeneric,
  ZanixInteractorsGetter,
} from 'typings/targets.ts'

import { getTargetKey } from 'utils/targets.ts'
import Program from 'modules/program/main.ts'

const interactors: (ctxId: string) => ZanixInteractorsGetter = (ctxId) => ({
  get: <T extends ZanixInteractorGeneric>(
    Interactor: ZanixInteractorClass<T>,
  ): T => Program.targets.getInstance<T>(getTargetKey(Interactor), 'interactor', { ctx: ctxId }),
})

/**
 * Registers a global middleware pipe as a Higher-Order Component (HOC).
 *
 * This function is used to define and register a global pipe that executes
 * before a request reaches its final handler. Pipes can be used for tasks
 * like input validation, request transformation, logging, or authorization.
 *
 * The provided pipe function is expected to conform to the {@link MiddlewareGlobalPipe} type,
 * and will be executed with the current request context and any optional arguments.
 *
 * @param {MiddlewareGlobalPipe} target - The global pipe function to be registered.
 *                                        It receives the handler context and can optionally be asynchronous.
 */
export function defineGlobalPipeHOC(
  target: MiddlewareGlobalPipe,
) {
  const { exports: { server } } = target
  delete target['exports' as never]

  const pipe: MiddlewarePipe = (ctx) => {
    target({ ...ctx, interactors: interactors(ctx.id) })
  }
  Program.middlewares.addGlobalPipe(pipe, server)
}

/**
 * Registers a global middleware interceptor as a Higher-Order Component (HOC).
 *
 * This function is used to define and register a global interceptor that wraps
 * the response after the request has been processed. Interceptors are useful for
 * response transformation, logging, error handling, or modifying headers.
 *
 * The interceptor function must conform to the {@link MiddlewareGlobalInterceptor} type,
 * receiving the request context, the response, and optional arguments.
 *
 * @param {MiddlewareGlobalInterceptor} target - The interceptor function to be registered.
 *                                               Can be synchronous or asynchronous and must return a `Response`.
 */
export function defineGlobalInterceptorHOC(
  target: MiddlewareGlobalInterceptor,
) {
  const { exports: { server } } = target
  delete target['exports' as never]

  const interceptor: MiddlewareInterceptor = (ctx, response) => {
    return target({ ...ctx, interactors: interactors(ctx.id) }, response)
  }
  Program.middlewares.addGlobalInterceptor(interceptor, server)
}
