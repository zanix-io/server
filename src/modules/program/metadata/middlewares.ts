import { BaseContainer } from './abstracts/main.ts'

export class MiddlewaresContainer extends BaseContainer {
  #interceptorsKey = (key = '') => `interceptors:${key}`
  #pipesKey = (key = '') => `pipes:${key}`

  /**
   * Function to add a pipe to a specified target or property.
   */
  public addPipe(pipe: MiddlewarePipe, { Target, propertyKey = 'local' }: MetadataProps = {}) {
    const pipes = this.getPipes({ Target, propertyKey })
    const pipesSet = new Set<MiddlewarePipe>(pipes)

    if (!pipesSet.has(pipe)) pipesSet.add(pipe)

    this.setData<MiddlewarePipe[]>(this.#pipesKey(propertyKey), Array.from(pipesSet), Target)
  }

  /**
   * Function to add a global pipe.
   */
  public addGlobalPipe(pipe: MiddlewarePipe, servers: WebServerTypes[]) {
    servers.forEach((server) => {
      this.addPipe(pipe, { propertyKey: server })
    })
  }

  /**
   * Retrieves all Pipes associated with a specific target or property
   */
  public getPipes({ Target, propertyKey = 'local' }: MetadataProps = {}): MiddlewarePipe[] {
    return this.getData<MiddlewarePipe[] | undefined>(this.#pipesKey(propertyKey), Target) || []
  }

  /**
   * Function to add an interceptor to a specified target or property
   */
  public addInterceptor(
    interceptor: MiddlewareInterceptor,
    { Target, propertyKey = 'local' }: MetadataProps = {},
  ) {
    const interceptors = this.getInterceptors({ Target, propertyKey })
    const interceptorsSet = new Set<MiddlewareInterceptor>(interceptors)

    if (!interceptorsSet.has(interceptor)) interceptorsSet.add(interceptor)

    this.setData<MiddlewareInterceptor[]>(
      this.#interceptorsKey(propertyKey),
      Array.from(interceptorsSet),
      Target,
    )
  }

  /**
   * Function to add a global interceptor.
   */
  public addGlobalInterceptor(interceptor: MiddlewareInterceptor, servers: WebServerTypes[]) {
    servers.forEach((server) => {
      this.addInterceptor(interceptor, { propertyKey: server })
    })
  }

  /**
   * Retrieves all interceptors associated with a specific target
   */
  public getInterceptors(
    { Target, propertyKey = 'local' }: MetadataProps = {},
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
    { Target, propertyKey = 'local' }: MetadataProps = {},
  ): MiddlewareInterceptor[] {
    return [
      ...this.getInterceptors({ Target }), // Target level interceptors
      ...this.getInterceptors({ Target, propertyKey }), // Property level interceptors
    ]
  }

  /**
   * Retrieves target pipes
   */
  public getTargetPipes({ Target, propertyKey = 'local' }: MetadataProps = {}): MiddlewarePipe[] {
    return [
      ...this.getPipes({ Target }), // Target level pipes
      ...this.getPipes({ Target, propertyKey }), // Property level pipes
    ]
  }

  /**
   * Retrieves all middlewares
   */
  public getMiddlewares(
    type: WebServerTypes,
    { Target, propertyKey = 'local' }: MetadataProps = {},
  ): { interceptors: Set<MiddlewareInterceptor>; pipes: Set<MiddlewarePipe> } {
    const interceptors = new Set([
      ...this.getInterceptors({ propertyKey: type }), // Global level interceptors
      ...this.getTargetInterceptors({ Target, propertyKey }),
    ])

    const pipes = new Set([
      ...this.getPipes({ propertyKey: type }), // Global level pipes
      ...this.getTargetPipes({ Target, propertyKey }),
    ])

    return { interceptors, pipes }
  }
}
