// deno-lint-ignore-file no-explicit-any
import type { MiddlewareGlobalInterceptor, MiddlewareGlobalPipe } from 'typings/middlewares.ts'
import type { HandlerContext } from 'typings/context.ts'
import type { ModuleTypes } from 'typings/program.ts'

import { BaseRTO, IsEmail, IsNumber, IsString, isUUID } from '@zanix/validator'
import { ZanixController } from 'modules/infra/handlers/rest/base.ts'
import { Controller } from 'modules/infra/handlers/rest/decorators/base.ts'

import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import { ZanixInteractor } from 'interactors/base.ts'
import { Interactor } from 'interactors/decorators/base.ts'
import { Connector } from 'connectors/decorators/base.ts'
import { ZanixAsyncmqConnector } from 'connectors/asyncmq.ts'
import { defineGlobalInterceptorHOC, defineGlobalPipeHOC } from 'middlewares/hocs/global.ts'
import { ZanixWebSocket } from 'handlers/sockets/base.ts'
import { Socket } from 'handlers/sockets/decorators/base.ts'
import { ZanixResolver } from 'handlers/graphql/base.ts'
import { Resolver } from 'handlers/graphql/decorators/base.ts'
import { Query } from 'handlers/graphql/decorators/query.ts'
import { Pipe } from 'middlewares/decorators/pipe.ts'
import { Interceptor } from 'modules/infra/middlewares/decorators/interceptor.ts'

import { JSON_CONTENT_HEADER } from 'utils/constants.ts'
import Program from 'modules/program/main.ts'
import type { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { webServerManager } from '@zanix/server'
import { stub } from '@std/testing/mock'

/** mocks */
stub(console, 'info')
stub(console, 'error')

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
@Connector({ startMode: 'onSetup' })
class Connectors extends ZanixAsyncmqConnector {
  public stopConnection() {
  }
  public async startConnection() {
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(true)
      }, 500)
    })
  }

  public def() {
    return 465
  }
}

/** Interactors */
@Interactor({ Connector: Connectors })
class InteractorX extends ZanixInteractor<Connectors> {
  constructor(context: string) {
    super(context)
    this.interactors.get(InteractorD).interactorDMessage
  }
  public welcomeMsg = 'welcome'

  public secondInteractor() {
    return this.interactors.get(InteractorD).interactorDMessage
  }

  public connectorMessage() {
    return `this connector is ${
      this.connector.connected && 'connected' || 'disconnected'
    } over def ${this.connector.def()} by ${
      isUUID(this.context.id) && 'uuid' || 'normal'
    } context and query param ${this.context.payload.search<S>('qparam')}`
  }
}

@Interactor()
class InteractorD extends ZanixInteractor {
  public interactorDMessage = 'interactor D'
  constructor(context: string) {
    super(context)

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
    await new Promise((resolve) => setTimeout(resolve, 500))
    return {
      message: this.interactor.interactorDMessage,
      socket: this.context.payload.params.qparam,
      data: this.context.payload.body,
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
      searchParam: ctx.url.searchParams.get('searchParam'),
      searchParam3: ctx.url.searchParams.get('searchParam3'),
    }
  }

  @Query({ input: { data: 'InputData', value: 'String' } })
  public hello(payload: { data: { name: string }; value: string }, ctx: HandlerContext) {
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
    return {
      message: 'Hello 2 ' + this.interactor.welcomeMsg,
      searchParam2: ctx.url.searchParams.get('searchParam2'),
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
    return {
      message: this.interactor.welcomeMsg + ':' + ctx.payload.params.email,
      search: ctx.payload.search.qparam,
      searchParamByMid: ctx.payload.search.searchParamByMid,
      secondMessage: this.interactor.secondInteractor(),
      connectorMessage: this.interactor.connectorMessage(),
      searchParamByPipe: ctx.url.searchParams.get('searchParamByPipe'),
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

@Controller()
class _ControllerBasic extends ZanixController {
  @Get()
  public hello() {
    return 'response'
  }
}

export const SOCKET_PORT = 9222
export const GQL_PORT = 9333

try {
  const id1 = webServerManager.create('rest', { server: { globalPrefix: '/api//' } })
  const id2 = webServerManager.create('socket', { server: { port: SOCKET_PORT } })
  const id3 = webServerManager.create('graphql', {
    server: { port: GQL_PORT, globalPrefix: '/gql//' },
  })

  await Promise.all(
    Program.targets.getTargetsByStartMode('onSetup').map((key) => {
      const [type, id] = key.split(':') as [ModuleTypes, string]
      const instance = Program.targets.getInstance<ZanixConnector>(id, type)
      if (type !== 'connector') return
      return instance.startConnection()
    }),
  )

  webServerManager.start([id1, id2, id3])
} catch {
  // ignore
}
