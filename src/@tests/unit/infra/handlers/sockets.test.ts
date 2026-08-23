// deno-lint-ignore-file no-explicit-any
import { assertSpyCalls, spy, stub } from '@std/testing/mock'
import { assertEquals, assertThrows } from '@std/assert'

import logger from '@zanix/logger'
import { ZanixWebSocket } from 'modules/infra/handlers/sockets/base.ts'

import { HttpError } from '@zanix/errors'
import { socketHandler } from 'modules/infra/handlers/sockets/handler.ts'

//Mocks
console.info = () => {}
console.error = () => {}

// Minimal concrete subclass for testing abstract ZanixWebSocket
class TestWebSocket extends ZanixWebSocket {
  // expose protected methods so we can call them from test
  public triggerOnopen(ev: Event) {
    this.onopen(ev)
  }
  public triggerOnclose(ev: CloseEvent) {
    this.onclose(ev)
  }
  public triggerOnmessage(ev: MessageEvent) {
    this.onmessage(ev)
  }
  public triggerOnerror(ev: Event | ErrorEvent) {
    this.onerror(ev)
  }
}

// Minimal ZanixWebSocket mock subclass to attach methods
class TestSocketHandler {
  public context: any
  public socket: any
  public onopen = spy(() => {})
  public onerror = spy(() => {})
  public onmessage = spy(() => {})
  public onclose = spy(() => {})
  public requestValidation = spy(async () => {})
}

Deno.test('ZanixWebSocket onopen logs correctly', () => {
  const logSpy = spy(logger, 'info')

  const ws = new TestWebSocket({ id: 'context-id' } as never)
  const event = new Event('open')

  ws.triggerOnopen(event)

  assertSpyCalls(logSpy, 1)
  assertEquals(logSpy.calls[0].args[0], 'Socket connection open')
  assertEquals(logSpy.calls[0].args[1], 'noSave')

  logSpy.restore()
})

Deno.test('ZanixWebSocket onclose logs correctly', () => {
  const logSpy = spy(logger, 'info')

  const ws = new TestWebSocket({ id: 'context-id' } as never)
  const event = new CloseEvent('close')

  ws.triggerOnclose(event)

  assertSpyCalls(logSpy, 1)
  assertEquals(logSpy.calls[0].args[0], 'Socket connection closed')
  assertEquals(logSpy.calls[0].args[1], 'noSave')

  logSpy.restore()
})

Deno.test('ZanixWebSocket onmessage logs correctly', () => {
  const logSpy = spy(logger, 'info')

  const ws = new TestWebSocket({ id: 'context-id' } as never)
  const event = new MessageEvent('message', { data: 'test' })

  ws.triggerOnmessage(event)

  assertSpyCalls(logSpy, 1)
  assertEquals(logSpy.calls[0].args[0], 'A socket message received')
  assertEquals(logSpy.calls[0].args[2], 'noSave')

  logSpy.restore()
})

Deno.test('ZanixWebSocket onerror logs correctly', () => {
  const logSpy = spy(logger, 'error')

  const ws = new TestWebSocket({ id: 'context-id' } as never)
  const errorEvent = new ErrorEvent('error', { message: 'failure' })

  ws.triggerOnerror(errorEvent)

  assertSpyCalls(logSpy, 1)
  assertEquals(logSpy.calls[0].args[0], 'An error occurred on socket')
  assertEquals(logSpy.calls[0].args[2], 'noSave')

  logSpy.restore()
})

Deno.test('ZanixWebSocket onmessage wrapper sends the sync response through the socket', () => {
  class SyncWebSocket extends ZanixWebSocket {
    protected override onmessage() {
      return { reply: 'sync' }
    }
  }

  const ws = new SyncWebSocket({ id: 'context-id' } as never)
  const sendSpy = spy((_data: string) => {})
  ;(ws as any).socket = { send: sendSpy }
  ;(ws as any).onmessage(new MessageEvent('message', { data: '{}' }))

  assertSpyCalls(sendSpy, 1)
  assertEquals(sendSpy.calls[0].args[0], JSON.stringify({ reply: 'sync' }))
})

Deno.test('ZanixWebSocket onmessage wrapper ignores a falsy resolved promise', async () => {
  class AsyncWebSocket extends ZanixWebSocket {
    protected override onmessage() {
      return Promise.resolve(undefined)
    }
  }

  const ws = new AsyncWebSocket({ id: 'context-id' } as never)
  const sendSpy = spy((_data: string) => {})
  ;(ws as any).socket = { send: sendSpy }
  ;(ws as any).onmessage(new MessageEvent('message', { data: '{}' }))
  await new Promise((resolve) => setTimeout(resolve, 10))

  assertSpyCalls(sendSpy, 0)
})

Deno.test('ZanixWebSocket onmessage wrapper sends a truthy resolved promise response', async () => {
  class AsyncWebSocket extends ZanixWebSocket {
    protected override onmessage() {
      return Promise.resolve({ reply: 'async' })
    }
  }

  const ws = new AsyncWebSocket({ id: 'context-id' } as never)
  const sendSpy = spy((_data: string) => {})
  ;(ws as any).socket = { send: sendSpy }
  ;(ws as any).onmessage(new MessageEvent('message', { data: '{}' }))
  await new Promise((resolve) => setTimeout(resolve, 10))

  assertSpyCalls(sendSpy, 1)
  assertEquals(sendSpy.calls[0].args[0], JSON.stringify({ reply: 'async' }))
})

Deno.test(
  "socketHandler's internal `catcher` passes the connection's own `ctx.id` as `contextId` to `logAppError`",
  async () => {
    // A plain `Error` (unlike an RTO-validation `HttpError`, which the throttle in
    // `shouldNotLogError` deliberately marks `_logged: false` and suppresses below its threshold)
    // is never suppressed — `isKnownError` is false for it, so `logAppError` always logs it. This
    // keeps the test about contextId propagation, not about the (unrelated, by-design) throttle.
    const logSpy = spy(logger, 'error')

    const fakeSocket: any = { send: spy(() => {}) }
    const upgradeStub = stub(
      Deno,
      'upgradeWebSocket',
      () => ({ socket: fakeSocket, response: new Response(null, { status: 101 }) }) as any,
    )

    const handlerThis = new TestSocketHandler()
    handlerThis.onerror = spy(() => {
      throw new Error('onerror boom')
    })

    const ctx = {
      id: 'socket-context-id',
      req: { headers: new Map([['Upgrade', 'websocket']]) },
    } as any

    try {
      const handler = socketHandler(null as never).bind(handlerThis as any)
      handler(ctx)

      // `socketHandler` wires `fakeSocket.onerror` synchronously before returning.
      await fakeSocket.onerror(new Event('error'))

      assertSpyCalls(logSpy, 1)
      const [message, error] = logSpy.calls[0].args as [
        string,
        { code?: string; contextId?: string },
      ]
      assertEquals(message, 'An error occurred on socket')
      assertEquals(error.code, 'SOCKET_ERROR')
      assertEquals(error.contextId, 'socket-context-id')
    } finally {
      logSpy.restore()
      upgradeStub.restore()
    }
  },
)

Deno.test('socketHandler throws HttpError if not websocket upgrade', () => {
  const ctx = {
    req: { headers: new Map() },
  } as any
  const handler = socketHandler(null as never).bind(new TestSocketHandler())
  assertThrows(
    () => handler(ctx),
    HttpError,
    'METHOD_NOT_ALLOWED',
  )
})
