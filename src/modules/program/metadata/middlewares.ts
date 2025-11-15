import type { MiddlewareGuard, MiddlewareInterceptor, MiddlewarePipe } from 'typings/middlewares.ts'
import type { MetadataTargetSymbols } from 'typings/program.ts'
import type { WebServerTypes } from 'typings/server.ts'

import { BaseContainer } from './base.ts'

export class MiddlewaresContainer extends BaseContainer {
  #interceptorsKey = (key = '') => `interceptors:${key}`
  #pipesKey = (key = '') => `pipes:${key}`
  #guardsKey = (key = '') => `guards:${key}`

  /**
   * Generic function to add a middleare
   */
  private addMiddleware<T extends MiddlewareGuard | MiddlewareInterceptor | MiddlewarePipe>(
    middleware: T,
    getMiddlewares: ({ Target, propertyKey }: MetadataTargetSymbols) => T[],
    keyFn: (propertyKey: string) => string,
    { Target, propertyKey = 'local' }: MetadataTargetSymbols = {},
  ) {
    const elements = getMiddlewares({ Target, propertyKey })
    const elementsSet = new Set<T>(elements)

    if (!elementsSet.has(middleware)) elementsSet.add(middleware)

    this.setData(keyFn(propertyKey), Array.from(elementsSet), Target)
  }

  /**
   * Function to add a pipe to a specified target or property.
   */
  public addPipe(
    pipe: MiddlewarePipe,
    { Target, propertyKey = 'local' }: MetadataTargetSymbols = {},
  ) {
    this.addMiddleware(pipe, this.getPipes.bind(this), this.#pipesKey.bind(this), {
      Target,
      propertyKey,
    })
  }

  /**
   * Function to add a global pipe.
   */
  public addGlobalPipe(pipe: MiddlewarePipe, servers: (WebServerTypes | 'all')[]) {
    servers.forEach((server) => {
      this.addPipe(pipe, { propertyKey: server })
    })
  }

  /**
   * Function to add a guard to a specified target or property.
   */
  public addGuard(
    guard: MiddlewareGuard,
    { Target, propertyKey = 'local' }: MetadataTargetSymbols = {},
  ) {
    this.addMiddleware(guard, this.getGuards.bind(this), this.#guardsKey.bind(this), {
      Target,
      propertyKey,
    })
  }

  /**
   * Function to add a global guard.
   */
  public addGlobalGuard(guard: MiddlewareGuard, servers: (WebServerTypes | 'all')[]) {
    servers.forEach((server) => {
      this.addGuard(guard, { propertyKey: server })
    })
  }
  /**
   * Function to add an interceptor to a specified target or property
   */
  public addInterceptor(
    interceptor: MiddlewareInterceptor,
    { Target, propertyKey = 'local' }: MetadataTargetSymbols = {},
  ) {
    this.addMiddleware(
      interceptor,
      this.getInterceptors.bind(this),
      this.#interceptorsKey.bind(this),
      {
        Target,
        propertyKey,
      },
    )
  }

  /**
   * Function to add a global interceptor.
   */
  public addGlobalInterceptor(
    interceptor: MiddlewareInterceptor,
    servers: (WebServerTypes | 'all')[],
  ) {
    servers.forEach((server) => {
      this.addInterceptor(interceptor, { propertyKey: server })
    })
  }

  /**
   * Retrieves all Guards associated with a specific property
   */
  public getGuards(
    { Target, propertyKey = 'local' }: MetadataTargetSymbols = {},
  ): MiddlewareGuard[] {
    return this.getData<MiddlewareGuard[] | undefined>(this.#guardsKey(propertyKey), Target) || []
  }

  /**
   * Retrieves all Pipes associated with a specific target or property
   */
  public getPipes({ Target, propertyKey = 'local' }: MetadataTargetSymbols = {}): MiddlewarePipe[] {
    return this.getData<MiddlewarePipe[] | undefined>(this.#pipesKey(propertyKey), Target) || []
  }

  /**
   * Retrieves all interceptors associated with a specific target
   */
  public getInterceptors(
    { Target, propertyKey = 'local' }: MetadataTargetSymbols = {},
  ): MiddlewareInterceptor[] {
    return this.getData<MiddlewareInterceptor[] | undefined>(
      this.#interceptorsKey(propertyKey),
      Target,
    ) || []
  }

  /**
   * Retrieves target interceptors
   */
  public getTargetInterceptors(
    { Target, propertyKey = 'local' }: MetadataTargetSymbols = {},
  ): MiddlewareInterceptor[] {
    return [
      ...this.getInterceptors({ Target }), // Target level interceptors
      ...this.getInterceptors({ Target, propertyKey }), // Property level interceptors
    ]
  }

  /**
   * Retrieves target pipes
   */
  public getTargetPipes(
    { Target, propertyKey = 'local' }: MetadataTargetSymbols = {},
  ): MiddlewarePipe[] {
    return [
      ...this.getPipes({ Target }), // Target level pipes
      ...this.getPipes({ Target, propertyKey }), // Property level pipes
    ]
  }

  /**
   * Retrieves target guards
   */
  public getTargetGuards(
    { Target, propertyKey = 'local' }: MetadataTargetSymbols = {},
  ): MiddlewareGuard[] {
    return [
      ...this.getGuards({ Target }), // Target level pipes
      ...this.getGuards({ Target, propertyKey }), // Property level pipes
    ]
  }

  /**
   * Retrieves all middlewares
   */
  public getMiddlewares(
    type: WebServerTypes,
    { Target, propertyKey = 'local' }: MetadataTargetSymbols = {},
  ): {
    interceptors: Set<MiddlewareInterceptor>
    pipes: Set<MiddlewarePipe>
    guards: Set<MiddlewareGuard>
  } {
    const interceptors = new Set([
      ...this.getInterceptors({ propertyKey: 'all' }), // Global level interceptors for all servers
      ...this.getInterceptors({ propertyKey: type }), // Global level interceptors for specific server
      ...this.getTargetInterceptors({ Target, propertyKey }),
    ])

    const pipes = new Set([
      ...this.getPipes({ propertyKey: 'all' }), // Global level pipes for all servers
      ...this.getPipes({ propertyKey: type }), // Global level pipes for specific server
      ...this.getTargetPipes({ Target, propertyKey }),
    ])

    const guards = new Set([
      ...this.getGuards({ propertyKey: 'all' }), // Global level guards for all servers
      ...this.getGuards({ propertyKey: type }), // Global level guards for specific server
      ...this.getTargetGuards({ Target, propertyKey }),
    ])

    return { interceptors, pipes, guards }
  }
}
