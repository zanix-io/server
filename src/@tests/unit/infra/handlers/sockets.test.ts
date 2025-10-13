// deno-lint-ignore-file no-explicit-any
import { assertSpyCalls, spy } from '@std/testing/mock'
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

  const ws = new TestWebSocket('context-id')
  const event = new Event('open')

  ws.triggerOnopen(event)

  assertSpyCalls(logSpy, 1)
  assertEquals(logSpy.calls[0].args[0], 'Socket connection open')
  assertEquals(logSpy.calls[0].args[1], 'noSave')

  logSpy.restore()
})

Deno.test('ZanixWebSocket onclose logs correctly', () => {
  const logSpy = spy(logger, 'info')

  const ws = new TestWebSocket('context-id')
  const event = new CloseEvent('close')

  ws.triggerOnclose(event)

  assertSpyCalls(logSpy, 1)
  assertEquals(logSpy.calls[0].args[0], 'Socket connection closed')
  assertEquals(logSpy.calls[0].args[1], 'noSave')

  logSpy.restore()
})

Deno.test('ZanixWebSocket onmessage logs correctly', () => {
  const logSpy = spy(logger, 'info')

  const ws = new TestWebSocket('context-id')
  const event = new MessageEvent('message', { data: 'test' })

  ws.triggerOnmessage(event)

  assertSpyCalls(logSpy, 1)
  assertEquals(logSpy.calls[0].args[0], 'A socket message received')
  assertEquals(logSpy.calls[0].args[2], 'noSave')

  logSpy.restore()
})

Deno.test('ZanixWebSocket onerror logs correctly', () => {
  const logSpy = spy(logger, 'error')

  const ws = new TestWebSocket('context-id')
  const errorEvent = new ErrorEvent('error', { message: 'failure' })

  ws.triggerOnerror(errorEvent)

  assertSpyCalls(logSpy, 1)
  assertEquals(logSpy.calls[0].args[0], 'An error occurred on socket')
  assertEquals(logSpy.calls[0].args[2], 'noSave')

  logSpy.restore()
})

Deno.test('socketHandler throws HttpError if not websocket upgrade', async () => {
  const ctx = {
    req: { headers: new Map() },
  } as any
  const handler = socketHandler(null as never).bind(new TestSocketHandler())
  await assertThrows(
    () => Promise.resolve(handler(ctx)),
    HttpError,
    'METHOD_NOT_ALLOWED',
  )
})
