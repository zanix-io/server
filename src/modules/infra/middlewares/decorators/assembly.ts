import type { ZanixGenericDecorator } from 'typings/decorators.ts'
import type {
  MiddlewareGuard,
  MiddlewareInterceptor,
  MiddlewarePipe,
  MiddlewareTypes,
} from 'typings/middlewares.ts'
import type { ClassConstructor } from 'typings/targets.ts'

import ProgramModule from 'modules/program/mod.ts'

/**
 * Defines a decorator for registering a middleware (pipe, guard, or interceptor) based on the provided middleware type.
 *
 * This function allows you to create a decorator that registers a middleware of a specific type. The middleware can be one of the following:
 * - **Guard**: Used for authorization checks, ensuring that a request is allowed to proceed.
 * - **Pipe**: Used for transforming or validating incoming data before it reaches the handler.
 * - **Interceptor**: Used for transforming outgoing responses or executing logic before/after a request handler.
 *
 * The decorator is dynamically configured based on the middleware type (`guard`, `pipe`, or `interceptor`), and the appropriate middleware type is applied.
 *
 * @template T - The type of the middleware. Can be one of `'guard'`, `'pipe'`, or `'interceptor'`.
 * @template M - The middleware function type, which is determined based on the value of `T`:
 *               - If `T` is `'guard'`, `M` is a `MiddlewareGuard`.
 *               - If `T` is `'pipe'`, `M` is a `MiddlewarePipe`.
 *               - If `T` is `'interceptor'`, `M` is a `MiddlewareInterceptor`.
 *
 * @param {M} middleware - The middleware function to be registered. Its type is determined by the `T` parameter.
 * @returns {Function} A decorator function that registers the given middleware.
 *
 * @example
 * // Example usage for a guard middleware
 * const guardMiddleware = defineMiddlewareDecorator<'guard', MiddlewareGuard>((context) => {
 *   // Guard logic here
 *   return true;
 * });
 *
 * // Example usage for a pipe middleware
 * const pipeMiddleware = defineMiddlewareDecorator<'pipe', MiddlewarePipe>((data) => {
 *   // Pipe logic here (e.g., transforming data)
 *   return data;
 * });
 *
 * // Example usage for an interceptor middleware
 * const interceptorMiddleware = defineMiddlewareDecorator<'interceptor', MiddlewareInterceptor>((response) => {
 *   // Interceptor logic here (e.g., modifying response)
 *   return response;
 * });
 */
export function defineMiddlewareDecorator<
  T extends MiddlewareTypes,
  M extends (T extends 'guard' ? MiddlewareGuard
    : T extends 'pipe' ? MiddlewarePipe
    : MiddlewareInterceptor),
>(
  type: T,
  middleware: M,
): ZanixGenericDecorator {
  return function (target, context) {
    if (context?.kind === 'class') {
      const fn = type === 'guard' ? 'addGuard' : type === 'pipe' ? 'addPipe' : 'addInterceptor'
      ProgramModule.middlewares[fn](middleware as never, { Target: target as ClassConstructor })
    } else {
      const handler = target.name.toString()
      ProgramModule.decorators.addDecoratorData<T>({ handler, mid: middleware } as never, type)
    }
  }
}

/** Appli defined middlewares to current target */
export function applyMiddlewaresToTarget(Target: ClassConstructor) {
  const guardDecorators = ProgramModule.decorators.getDecoratorsData('guard')
  const pipeDecorators = ProgramModule.decorators.getDecoratorsData('pipe')
  const interceptorDecorators = ProgramModule.decorators.getDecoratorsData('interceptor')

  guardDecorators.forEach((guard) => {
    ProgramModule.middlewares.addGuard(guard.mid, { Target, propertyKey: guard.handler })
  })

  pipeDecorators.forEach((pipe) => {
    ProgramModule.middlewares.addPipe(pipe.mid, { Target, propertyKey: pipe.handler })
  })

  interceptorDecorators.forEach((interceptor) => {
    ProgramModule.middlewares.addInterceptor(interceptor.mid, {
      Target,
      propertyKey: interceptor.handler,
    })
  })

  ProgramModule.decorators.deleteDecorators('guard')
  ProgramModule.decorators.deleteDecorators('pipe')
  ProgramModule.decorators.deleteDecorators('interceptor')
}
