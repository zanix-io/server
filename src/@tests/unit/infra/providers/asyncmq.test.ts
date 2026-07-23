import { assert, assertEquals, assertThrows } from '@std/assert'
import { HttpError, InternalError } from '@zanix/errors'
import { ZanixAsyncMQProvider } from 'providers/core/asyncmq.ts'
import { ZanixAsyncmqConnector } from 'modules/infra/connectors/core/asyncmq.ts'
import Program from 'modules/program/mod.ts'
import ProgramModule from 'modules/program/mod.ts'

console.error = () => {}

class TestAsyncmqConnector extends ZanixAsyncmqConnector {
  protected override initialize(): Promise<void> | void {}
  protected override close(): unknown {
    return true
  }
  public override isHealthy() {
    return true
  }
}

class TestAsyncMQProvider extends ZanixAsyncMQProvider {
  public override enqueue() {
    return true
  }
}

Deno.test('ZanixAsyncMQProvider: asyncmq getter is blocked, use `this` instead', () => {
  const provider = new TestAsyncMQProvider('id')

  assertThrows(
    () => provider['asyncmq'],
    InternalError,
    'Direct access to `asyncmq` is not allowed. Use `this` instead.',
  )
})

Deno.test('ZanixAsyncMQProvider: use() delegates to the asyncmq connector', () => {
  Program.targets.defineTarget('asyncmq', {
    Target: TestAsyncmqConnector,
    type: 'connector',
    lifetime: 'SINGLETON',
  })

  const provider = new TestAsyncMQProvider('id')

  const connector = provider.use()
  assert(connector instanceof TestAsyncmqConnector)
})

Deno.test('ZanixAsyncMQProvider: getContext delegates to ProgramModule.context', () => {
  const provider = new TestAsyncMQProvider('id')

  const context = { id: 'ctx-1' }
  ProgramModule.context.getContext = ((id: string) => {
    assertEquals(id, 'ctx-1')
    return context
  }) as never

  assertEquals(provider['getContext']('ctx-1'), context)
})

Deno.test({
  name:
    'ZanixAsyncMQProvider: default sendMessage/requeueDeadLetters/schedule throw METHOD_NOT_IMPLEMENTED',
  fn: () => {
    const provider = new TestAsyncMQProvider('id')

    assertThrows(
      () => provider.sendMessage('topic', 'msg', { contextId: undefined }),
      HttpError,
      'An error occurred in the system',
    )
    assertThrows(
      () => provider.requeueDeadLetters('queue'),
      HttpError,
      'An error occurred in the system',
    )
    assertThrows(
      () => provider.schedule('queue', 'msg', { contextId: undefined, delay: 0 }),
      HttpError,
      'An error occurred in the system',
    )
  },
})
