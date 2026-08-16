import type {
  GenericHandlerOptions,
  HandlerDecoratorOptions,
  ZanixClassDecorator,
} from 'typings/decorators.ts'

import { defineSsrControllerDecorator } from './assembly.ts'

/**
 * Class decorator used to define a server-rendered (`'ssr'`) `controller` class.
 *
 * This decorator marks a class as an SSR controller and optionally assigns a route prefix
 * that will be used to namespace all the routes defined within the controller.
 *
 * The decorated class must extend `ZanixSsrController`; any `@Get`/`@Post`/`@Patch`/`@Put`/
 * `@Delete`/`@Request` methods declared in it are collected and registered as routes once this
 * decorator runs — the same method decorators REST controllers use, since they carry no
 * server-type of their own.
 *
 * @param {string} prefix - Optional route prefix applied to all endpoints within the controller.
 * @throws {InternalError} If the decorated class does not extend `ZanixSsrController`.
 * @returns {ZanixClassDecorator} The class decorator function.
 *
 * @example
 * ```ts
 * \@SsrController('products')
 * class ProductsController extends ZanixSsrController {
 *   \@Get(':id')
 *   public getProduct(ctx: HandlerContext<{ params: { id: string } }>) {
 *     return renderToResponse(<ProductPage id={ctx.payload.params.id} />)
 *   }
 * }
 * ```
 */
export function SsrController(
  prefix?: string,
): ZanixClassDecorator

/**
 * Class decorator used to define a server-rendered (`'ssr'`) `controller` class.
 *
 * This decorator marks a class as an SSR controller and optionally assigns a route prefix
 * that will be used to namespace all the routes defined within the controller.
 *
 * The decorated class must extend `ZanixSsrController`; any `@Get`/`@Post`/`@Patch`/`@Put`/
 * `@Delete`/`@Request` methods declared in it are collected and registered as routes once this
 * decorator runs — the same method decorators REST controllers use, since they carry no
 * server-type of their own.
 *
 * @param options An object containing 'prefix', 'enableALS' and 'Interactor' properties.
 * @throws {InternalError} If the decorated class does not extend `ZanixSsrController`.
 * @returns {ZanixClassDecorator} The class decorator function.
 *
 * @example
 * ```ts
 * \@SsrController({ prefix: 'products', Interactor: ProductsInteractor })
 * class ProductsController extends ZanixSsrController<ProductsInteractor> {
 *   \@Get(':id')
 *   public getProduct(ctx: HandlerContext<{ params: { id: string } }>) {
 *     return renderToResponse(<ProductPage product={this.interactor.findById(ctx.payload.params.id)} />)
 *   }
 * }
 * ```
 */
export function SsrController(
  options: GenericHandlerOptions & {
    /** Route prefix */
    prefix?: string
  },
): ZanixClassDecorator

export function SsrController(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  return defineSsrControllerDecorator(options)
}
