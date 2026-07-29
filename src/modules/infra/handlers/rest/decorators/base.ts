import type {
  GenericHandlerOptions,
  HandlerDecoratorOptions,
  ZanixClassDecorator,
} from 'typings/decorators.ts'

import { defineControllerDecorator } from './assembly.ts'

/**
 * Class decorator used to define a REST `controller` class.
 *
 * This decorator marks a class as a REST controller and optionally assigns a route prefix
 * that will be used to namespace all the routes defined within the controller.
 *
 * The decorated class must extend `ZanixController`; any `@Get`/`@Post`/`@Patch`/`@Put`/
 * `@Delete`/`@Request` methods declared in it are collected and registered as routes once
 * this decorator runs.
 *
 * @param {string} prefix - Optional route prefix applied to all endpoints within the controller.
 * @throws {InternalError} If the decorated class does not extend `ZanixController`.
 * @returns {ZanixClassDecorator} The class decorator function.
 *
 * @example
 * ```ts
 * \@Controller('users')
 * class UsersController extends ZanixController {
 *   \@Get(':id')
 *   public getUser(ctx: HandlerContext<{ params: { id: string } }>) {
 *     return { id: ctx.payload.params.id }
 *   }
 * }
 * ```
 */
export function Controller(
  prefix?: string,
): ZanixClassDecorator

/**
 * Class decorator used to define a REST `controller` class.
 *
 * This decorator marks a class as a REST controller and optionally assigns a route prefix
 * that will be used to namespace all the routes defined within the controller.
 *
 * The decorated class must extend `ZanixController`; any `@Get`/`@Post`/`@Patch`/`@Put`/
 * `@Delete`/`@Request` methods declared in it are collected and registered as routes once
 * this decorator runs.
 *
 * @param options An object containing 'prefix', 'enableALS' and 'Interactor' properties.
 * @throws {InternalError} If the decorated class does not extend `ZanixController`.
 * @returns {ZanixClassDecorator} The class decorator function.
 *
 * @example
 * ```ts
 * \@Controller({ prefix: 'users', Interactor: UsersInteractor })
 * class UsersController extends ZanixController<UsersInteractor> {
 *   \@Get(':id')
 *   public getUser(ctx: HandlerContext<{ params: { id: string } }>) {
 *     return this.interactor.findById(ctx.payload.params.id)
 *   }
 * }
 * ```
 */
export function Controller(
  options: GenericHandlerOptions & {
    /** Route prefix */
    prefix?: string
  },
): ZanixClassDecorator

export function Controller(
  options?: HandlerDecoratorOptions,
): ZanixClassDecorator {
  return defineControllerDecorator(options)
}
