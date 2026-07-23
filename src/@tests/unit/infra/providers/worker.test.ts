import { assertEquals } from '@std/assert'
import { ZanixWorkerProvider } from 'providers/core/worker.ts'
import ProgramModule from 'modules/program/mod.ts'

console.error = () => {}

class TestWorkerProvider extends ZanixWorkerProvider {
  public override runJob() {
    return true
  }
  public override runTask() {
    return true
  }
}

Deno.test('ZanixWorkerProvider: executeGeneralTask wires a bound invoke function', () => {
  const provider = new TestWorkerProvider('id')

  const invoke = provider.executeGeneralTask((x: number) => x + 1, {
    metaUrl: import.meta.url,
  })

  assertEquals(typeof invoke, 'function')
})

Deno.test('ZanixWorkerProvider: getContext delegates to ProgramModule.context', () => {
  const provider = new TestWorkerProvider('id')

  const context = { id: 'ctx-1' }
  ProgramModule.context.getContext = ((id: string) => {
    assertEquals(id, 'ctx-1')
    return context
  }) as never

  assertEquals(provider['getContext']('ctx-1'), context)
})
