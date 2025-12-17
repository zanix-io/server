// deno-lint-ignore-file no-explicit-any
import type { MiddlewareGlobalInterceptor, MiddlewareGlobalPipe } from 'typings/middlewares.ts'
import type { HandlerContext, ScopedContext } from 'typings/context.ts'

import { BaseRTO, IsEmail, IsNumber, IsString, isUUID } from '@zanix/validator'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'

import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import { ZanixInteractor } from 'interactors/base.ts'
import { Interactor } from 'interactors/decorators/base.ts'
import { Connector } from 'connectors/decorators/base.ts'
import { ZanixWebSocket } from 'handlers/sockets/base.ts'
import { Socket } from 'handlers/sockets/decorators/base.ts'
import { ZanixResolver } from 'handlers/graphql/base.ts'
import { Resolver } from 'handlers/graphql/decorators/base.ts'
import { Query } from 'handlers/graphql/decorators/query.ts'
import { Pipe } from 'middlewares/decorators/pipe.ts'
import { Interceptor } from 'modules/infra/middlewares/decorators/interceptor.ts'

import { DEFAULT_CONTEXT_ID, JSON_CONTENT_HEADER } from 'utils/constants.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { assert } from '@std/assert/assert'
import { assertEquals } from '@std/assert/assert-equals'
import ProgramModule from 'modules/program/mod.ts'
import { Provider } from 'providers/decorators/base.ts'
import { ZanixProvider } from 'providers/base.ts'
import { ZanixCacheProvider } from 'providers/core/cache.ts'
import { ZanixCacheConnector } from 'modules/infra/connectors/core/cache.ts'
import { Guard } from 'modules/infra/middlewares/decorators/guard.ts'
import { ZanixKVConnector } from 'modules/infra/connectors/core/kv.ts'
import { registerGlobalPipe } from 'modules/infra/middlewares/defs/pipes.ts'
import { registerGlobalInterceptor } from 'modules/infra/middlewares/defs/interceptors.ts'
import { Post } from 'modules/infra/handlers/rest/decorators/post.ts'

/** RTOS */
class C extends BaseRTO {
  constructor() {
    super()
    ;(this.context as any).payload.pasrams //this should not fail
  }
  @IsEmail({ expose: true })
  accessor email!: string
}
class S extends BaseRTO {
  @IsNumber()
  accessor qparam!: string

  @IsString({ optional: true, expose: true })
  accessor searchParamByMid!: string
}

/** Connectors */

@Connector({ startMode: 'onBoot' })
class _ConnectorA extends ZanixConnector {
  protected override initialize() {
  }
  public override isHealthy() {
    return true
  }
  protected override close() {
    return true
  }
}

@Connector({ startMode: 'postBoot' })
class _ConnectorB extends _ConnectorA {
}
@Connector()
class _ConnectorC extends _ConnectorB {
}
@Connector({ startMode: 'onSetup' })
class Connectors extends ZanixConnector {
  #connected = false
  protected override initialize(): Promise<void> | void {
  }
  constructor(contextId?: string) {
    assertEquals(contextId, DEFAULT_CONTEXT_ID)
    super({ contextId: contextId })
  }
  public getConnected(): boolean {
    return this.#connected
  }
  public close() {
    return true
  }
  public isHealthy() {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        this.#connected = true
        resolve(true)
      }, 500)
    })
  }

  public changeLocals(context: ScopedContext) {
    context.locals['data'] = 'local data'
  }

  public def() {
    return 465
  }
}

@Connector({ type: 'kvLocal', startMode: 'lazy', lifetime: 'SCOPED' })
class _KVLocal extends ZanixKVConnector {
  public override get<O = any>(_: string): O | undefined {
    return 'my kv local value' as any
  }
  public override set(_: string, __: any, ___?: number | 'KEEPTTL'): void {
    throw new Error('Method not implemented.')
  }
  public override delete(_?: string): void {
    throw new Error('Method not implemented.')
  }
  public override clear(): void {
    throw new Error('Method not implemented.')
  }
  public override getClient<T = any>(): T {
    throw new Error('Method not implemented.')
  }
  public override withLock<T>(_: string, _fn: () => T | Promise<T>): Promise<T> {
    throw new Error('Method not implemented.')
  }
  protected override initialize(): Promise<void> | void {
  }
  protected override close() {
  }
  public override isHealthy(): Promise<boolean> | boolean {
    return true
  }
}

@Connector('cache:local')
class _CacheClass extends ZanixCacheConnector {
  public getClient(): any {
    throw new Error('Method not implemented.')
  }
  public override set(_: any, __: any): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public get(_: any): any {
    return '1'
  }
  public override has(_: any): boolean {
    throw new Error('Method not implemented.')
  }
  public override delete(_: any): boolean {
    throw new Error('Method not implemented.')
  }
  public override clear(): void {
    throw new Error('Method not implemented.')
  }
  public override size(): number {
    throw new Error('Method not implemented.')
  }
  public override keys(): any[] {
    throw new Error('Method not implemented.')
  }
  public override values<O = any>(): O[] {
    throw new Error('Method not implemented.')
  }
  protected override initialize(): void {
  }
  protected override close(): unknown {
    return true
  }
  public override isHealthy(): Promise<boolean> | boolean {
    return true
  }
}

@Provider('cache')
class _CacheProviderClass extends ZanixCacheProvider<{ cache: any }> {
}

@Provider({ startMode: 'postBoot' })
class ProviderClass extends ZanixProvider<{ cache: any }> {
  constructor() {
    super()
    assertEquals(this.cache.local.get(), '1')
  }
  public override use(_: unknown): ZanixConnector {
    throw new Error('Method not implemented.')
  }
  public providerMessage = 'provider class'
}

/** Interactors */
@Interactor({ Connector: Connectors, Provider: ProviderClass })
class InteractorX extends ZanixInteractor<{ Connector: Connectors; Provider: ProviderClass }> {
  constructor(contextId?: string) {
    super(contextId)
    this.interactors.get(InteractorD).interactorDMessage
  }
  public welcomeMsg = 'welcome'

  public secondInteractor() {
    assertEquals(this.context.cookies['X-Znx-Cookie'], 'value')
    return this.interactors.get(InteractorD).interactorDMessage
  }

  public providerInfo() {
    return this.provider.providerMessage + this.connectors.get(Connectors).def() +
      this.providers.get(ProviderClass).providerMessage
  }

  public connectorMessage() {
    this.connector.changeLocals(this.context)
    return `this connector is ${
      this.connector.getConnected() && 'connected' || 'disconnected'
    } over def ${this.connector.def()} by ${
      isUUID(this.context.id) && 'uuid' || 'normal'
    } context and query param ${this.context.payload.search<S>('qparam')}`
  }
}

@Interactor()
class InteractorD extends ZanixInteractor<{ cache: any }> {
  public interactorDMessage = 'interactor D'
  constructor(contextId?: string) {
    super(contextId)

    assertEquals(this.kvLocal.get(''), 'my kv local value')
    this.interactorDMessage = 'interactor D message'
  }

  public send() {
    assertEquals(this.registry.get<_Socket>('socket:user-id')?.send({}), 'message sent')
  }
}

/** Global middlewares */
const globalMid: MiddlewareGlobalPipe = function MiddlewareGlobalPipe(ctx) {
  ctx.interactors.get(InteractorD).interactorDMessage
  ctx.payload.search = {
    ...ctx.payload.search,
    searchParamByMid: `param value ${ctx.interactors.get(InteractorD).interactorDMessage}`,
  }
}

globalMid.exports = {
  server: ['rest'], // this pipe is only for rest servers
}
registerGlobalPipe(globalMid)

const globalGQL: MiddlewareGlobalPipe = function MiddlewareGlobalPipe(ctx) {
  ctx.interactors.get(InteractorD).interactorDMessage
  ctx.payload.search = {
    ...ctx.payload.search,
    searchParamByMidGql: `param value ${ctx.interactors.get(InteractorD).interactorDMessage}`,
  }
}

globalGQL.exports = {
  server: ['graphql'], // this pipe is only for gql servers
}
registerGlobalPipe(globalGQL)

const globalInt: MiddlewareGlobalInterceptor = function MiddlewareGlobalPipe(_, response) {
  response.headers.set('global-header', 'global interceptor header')
  return response
}

globalInt.exports = {
  server: ['rest', 'graphql'],
}
registerGlobalInterceptor(globalInt)

/** Sockets */
@Socket({ route: 'mysock/:qparam', Interactor: InteractorD, rto: { Body: C, Params: S } })
@Guard((ctx) => {
  ctx.locals.session = { id: '9' } as never
  return {}
})
class _Socket extends ZanixWebSocket<InteractorD> {
  constructor(ctx: any) {
    super(ctx)
    this.registry.set('socket:user-id', this)
  }
  protected override onopen(_ev: Event): void {
    assertEquals(this.context.session?.id, '9')
  }
  protected override async onmessage(_e: MessageEvent) {
    assert(this.context.id)
    assert(this.context.payload)
    assert(this.context.req)
    assert(this.context.url)

    const contextId = ProgramModule.context.getContext(this.context.id).id
    assert(contextId)

    await new Promise((resolve) => setTimeout(resolve, 500))
    this.interactor.send()
    return {
      message: this.interactor.interactorDMessage,
      socket: this.context.payload.params.qparam,
      data: this.context.payload.body,
      contextId,
    }
  }

  protected override onclose(_ev: CloseEvent): void {
    ProgramModule.registry.delete('socket:user-id')
  }

  public send(_data: { transactionId?: string }) {
    return 'message sent'
  }
}

/** Resolvers */
@Resolver({ Interactor: InteractorD })
@Pipe((ctx) => {
  ctx.url.searchParams.append('searchParam', 'GQL Pipe search param')
})
class _Resolver extends ZanixResolver<InteractorD> {
  @Query({ output: 'OutputData' })
  @Pipe((ctx) => {
    ctx.url.searchParams.append('searchParam3', 'GQL Pipe search param for hello3')
  })
  public hello3(_: unknown, ctx: HandlerContext) {
    return {
      otherData: 'not resolved',
      searchParam: ctx.url.searchParams.get('searchParam'),
      searchParam3: ctx.url.searchParams.get('searchParam3'),
    }
  }

  @Query({ input: { data: 'InputData', value: 'String' } })
  public hello(payload: { data: { name: string }; value: string }, ctx: HandlerContext) {
    assert(this.context.id)
    assert(this.context.payload)
    assert(this.context.req)
    assert(this.context.url)
    return {
      message: 'Hello ' + payload.data.name + 'welcome to GQL',
      info: {
        params: payload.value,
        interactorMessage: this.interactor.interactorDMessage,
        searchParamByGlobalMidGql: ctx.payload.search.searchParamByMidGql,
        searchParam: ctx.url.searchParams.get('searchParam'),
        searchParam3: ctx.url.searchParams.get('searchParam3') ? 'fail' : undefined, // to be undefined,
      },
    }
  }
}

@Resolver({ Interactor: InteractorX, prefix: 'welcome' })
class _Resolver2 extends ZanixResolver<InteractorX> {
  @Query()
  @Interceptor(async (_, response) => {
    return new Response(
      JSON.stringify({ message: 'hello intercepted', currentMessage: await response.json() }),
      { headers: JSON_CONTENT_HEADER },
    )
  })
  @Pipe((ctx) => {
    ctx.url.searchParams.append('searchParam2', 'GQL Pipe search param for hello2')
  })
  public hello2(_: unknown, ctx: HandlerContext) {
    const contextId = ProgramModule.context.getContext(this.context.id).id
    assert(contextId)

    return {
      message: 'Hello 2 ' + this.interactor.welcomeMsg,
      searchParam2: ctx.url.searchParams.get('searchParam2'),
      contextId,
    }
  }
  @Query()
  public hello4() {
    return new Response('Hello 4 ')
  }
  @Query()
  public hello5() {
    return 'Hello 5'
  }
}

/** Controllers */
@Controller({ Interactor: InteractorX, prefix: 'welcome' })
class _Controller extends ZanixController<InteractorX> {
  @Get(':email', { Params: C, Search: S })
  @Pipe((ctx) => {
    ctx.url.searchParams.append('searchParamByPipe', 'Pipe search param')
  })
  @Interceptor((ctx, response) => {
    assertEquals(ctx.locals.data, 'local data')
    return response
  })
  public welcome(ctx: HandlerContext<{ params: C; search: S & { searchParamByMid: string } }>) {
    assert(this.context.id)
    assert(this.context.payload)
    assert(this.context.req)
    assert(this.context.url)

    assert(ProgramModule.context.getContext(this.context.id).id)

    return {
      message: this.interactor.welcomeMsg + ':' + ctx.payload.params.email,
      search: ctx.payload.search.qparam,
      searchParamByMid: ctx.payload.search.searchParamByMid,
      secondMessage: this.interactor.secondInteractor(),
      connectorMessage: this.interactor.connectorMessage(),
      providerInfo: this.interactor.providerInfo(),
      searchParamByPipe: ctx.url.searchParams.get('searchParamByPipe'),
      contextId: this.context.id,
    }
  }
  @Get('')
  @Interceptor((_) => {
    return new Response(JSON.stringify({ message: 'hello intercepted' }))
  })
  public welcomeIntercepted() {
    return {
      message: 'hello',
    }
  }
}

@Controller({ enableALS: true })
class _ControllerBasic extends ZanixController {
  @Get('hello')
  public hello() {
    return 'response'
  }
  @Post('test', { Body: C })
  public testPost() {
    return 'response test post'
  }
  @Get('test')
  public testGet() {
    return 'response test get'
  }
  @Get(':relative/not-allowed')
  public testNotAllowed() {
    return 'response not allowed'
  }
}

@Controller()
class _ControllerGuard extends ZanixController {
  @Get()
  @Guard((ctx) => {
    return { response: new Response(ctx.id) }
  })
  public helloGuard() {
    return 'response'
  }
  @Get('')
  public hello() {
    return 'response'
  }

  @Get()
  public unhandledError() {
    return setTimeout(() => {
      throw new Error('Error')
    })
  }
  @Get()
  public promiseRejection() {
    Promise.reject('Error')
  }
}
