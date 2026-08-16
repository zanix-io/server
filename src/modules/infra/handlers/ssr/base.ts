import type { ZanixInteractorGeneric } from 'typings/targets.ts'
import type { HandlerContext } from 'typings/context.ts'

import { HandlerGenericClass } from '../generic.ts'

/**
 * Abstract class that extends `HandlerGenericClass` and serves as a controller for handling
 * server-rendered ('ssr') routes in Deno server applications. Shares the exact same request/
 * response contract as `ZanixController` (both are `HandlerGenericClass<Interactor, HandlerContext>`)
 * — the only difference is the server type it registers under, via the `SsrController` decorator.
 * Classes extending `ZanixSsrController` must implement the logic for handling HTTP requests and
 * returning appropriate responses.
 *
 * @extends HandlerGenericClass
 * @template Interactor - The generic type representing the type of interactors used in the controller.
 *                        By default, it is set to `never` meaning no interactor is provided unless specified.
 * @template Extensions - Additional member shapes a further subclass needs beyond `HandlerContext`
 *                        (e.g. a page-framework's own typed `loader`/`component` members) — same
 *                        role `ZanixWebSocket` already gives its own `Extensions` parameter. Defaults
 *                        to `never`, so a direct `ZanixSsrController` subclass is unaffected.
 */
export abstract class ZanixSsrController<
  Interactor extends ZanixInteractorGeneric = never,
  Extensions = never,
> extends HandlerGenericClass<Interactor, HandlerContext | Extensions> {
  /** Creates the controller instance, scoped to the current request's context. */
  constructor(protected context: HandlerContext) {
    super(context.id)
  }
}
