// deno-lint-ignore-file no-explicit-any
import type { MiddlewareGlobalInterceptor, MiddlewareGlobalPipe } from 'typings/middlewares.ts'
import type { HandlerContext } from 'typings/context.ts'

import { BaseRTO, IsEmail, IsNumber, IsString, isUUID } from '@zanix/validator'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'

import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import { ZanixInteractor } from 'interactors/base.ts'
import { Interactor } from 'interactors/decorators/base.ts'
import { Connector } from 'connectors/decorators/base.ts'
import { ZanixAsyncmqConnector } from 'modules/infra/connectors/core/asyncmq.ts'
import {
  defineGlobalInterceptorHOC,
  defineGlobalPipeHOC,
} from 'modules/infra/middlewares/hocs/base.ts'
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
class Connectors extends ZanixAsyncmqConnector {
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

  public def() {
    return 465
  }
}

@Provider()
class ProviderClass extends ZanixProvider<{ cache: any }> {
  public override use(_: unknown): ZanixConnector {
    throw new Error('Method not implemented.')
  }
  public providerMessage = 'provider class'
}

/** Interactors */
@Interactor({ Connector: Connectors, Provider: ProviderClass })
class InteractorX extends ZanixInteractor<{ Connector: Connectors; Provider: ProviderClass }> {
  constructor(contextId: string) {
    super(contextId)
    this.interactors.get(InteractorD).interactorDMessage
  }
  public welcomeMsg = 'welcome'

  public secondInteractor() {
    return this.interactors.get(InteractorD).interactorDMessage
  }

  public providerInfo() {
    return this.provider.providerMessage + this.connectors.get(Connectors).def() +
      this.providers.get(ProviderClass).providerMessage
  }

  public connectorMessage() {
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
  constructor(contextId: string) {
    super(contextId)

    this.interactorDMessage = 'interactor D message'
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
defineGlobalPipeHOC(globalMid)

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
defineGlobalPipeHOC(globalGQL)

const globalInt: MiddlewareGlobalInterceptor = function MiddlewareGlobalPipe(_, response) {
  response.headers.set('global-header', 'global interceptor header')
  return response
}

globalInt.exports = {
  server: ['rest', 'graphql'],
}
defineGlobalInterceptorHOC(globalInt)

/** Sockets */
@Socket({ route: 'mysock/:qparam', Interactor: InteractorD, rto: { Body: C, Params: S } })
class _Socket extends ZanixWebSocket<InteractorD> {
  protected override async onmessage(_e: MessageEvent) {
    assert(this.context.id)
    assert(this.context.payload)
    assert(this.context.req)
    assert(this.context.url)

    const contextId = ProgramModule.context.getContext(this.context.id).id
    assert(contextId)

    await new Promise((resolve) => setTimeout(resolve, 500))
    return {
      message: this.interactor.interactorDMessage,
      socket: this.context.payload.params.qparam,
      data: this.context.payload.body,
      contextId,
    }
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
  @Get('intercepted')
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
  @Get()
  public hello() {
    return 'response'
  }
}
