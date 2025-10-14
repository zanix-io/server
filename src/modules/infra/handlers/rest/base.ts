import type { ZanixInteractorGeneric } from 'typings/targets.ts'

import { HandlerGenericClass } from '../generic.ts'

/**
 * Abstract class that extends `HandlerGenericClass` and serves as a controller for handling REST routes.
 * This class provides the base structure for implementing RESTful controllers in Deno server applications.
 * Classes extending `ZanixController` must implement the logic for handling HTTP requests and returning appropriate responses.
 *
 * @extends HandlerBaseClass
 * @template Interactor - The generic type representing the type of interactors used in the controller.
 *                        By default, it is set to `never` meaning no interactor is provided unless specified.
 */
export abstract class ZanixController<Interactor extends ZanixInteractorGeneric = never>
  extends HandlerGenericClass<Interactor> {}
