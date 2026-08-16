// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from '@std/assert'
import { dispatchWorkerTask, ZanixWorkerProvider } from 'providers/core/worker.ts'
import ProgramModule from 'modules/program/mod.ts'
import PublicProgramModule from 'modules/program/public.ts'
import { WorkerManager } from '@zanix/workers'

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

/** Stubs `WorkerManager.prototype.task`, capturing every call's `(fn, options)` pair. */
const stubWorkerManagerTask = () => {
  const original = WorkerManager.prototype.task
  const calls: { fn: unknown; options: any }[] = []
  ;(WorkerManager.prototype as any).task = function (fn: unknown, options: any) {
    calls.push({ fn, options })
    return {
      invoke: (...args: unknown[]) => options.onFinish?.({ response: args, error: null }),
    }
  }
  return { calls, restore: () => (WorkerManager.prototype.task = original) }
}

/** Stubs `PublicProgramModule.getProviders` via its prototype — the export is frozen. */
const stubGetProviders = (get: (key: unknown) => unknown) => {
  const proto = Object.getPrototypeOf(PublicProgramModule)
  const original = proto.getProviders
  proto.getProviders = () => ({ get })
  return () => (proto.getProviders = original)
}

Deno.test("dispatchWorkerTask: mode 'one-time' dispatches via a fresh WorkerManager", () => {
  const { calls, restore } = stubWorkerManagerTask()
  try {
    const invoke = dispatchWorkerTask((x: number) => x + 1, {
      mode: 'one-time',
      metaUrl: import.meta.url,
    })
    invoke(1)

    assertEquals(calls.length, 1)
    assertEquals(calls[0].options.metaUrl, import.meta.url)
    assertEquals(calls[0].options.autoClose, true)
  } finally {
    restore()
  }
})

Deno.test("dispatchWorkerTask: mode 'one-time' forwards verbose to the WorkerManager task", () => {
  const { calls, restore } = stubWorkerManagerTask()
  try {
    dispatchWorkerTask((x: number) => x, {
      mode: 'one-time',
      metaUrl: import.meta.url,
      verbose: false,
    })
    assertEquals(calls[0].options.verbose, false)
  } finally {
    restore()
  }
})

Deno.test("dispatchWorkerTask: mode 'persisted' with a provider() uses executeGeneralTask", () => {
  const { calls: workerManagerCalls, restore: restoreWM } = stubWorkerManagerTask()
  const executeGeneralTaskCalls: unknown[] = []
  const fakeProvider = {
    executeGeneralTask: (fn: unknown, options: unknown) => {
      executeGeneralTaskCalls.push({ fn, options })
      return () => {}
    },
  }
  try {
    const invoke = dispatchWorkerTask((x: number) => x, {
      mode: 'persisted',
      metaUrl: import.meta.url,
      provider: () => fakeProvider as never,
    })
    invoke(1)

    assertEquals(executeGeneralTaskCalls.length, 1)
    assertEquals(workerManagerCalls.length, 0)
    assert(typeof invoke === 'function')
  } finally {
    restoreWM()
  }
})

Deno.test("dispatchWorkerTask: mode 'persisted' falls back when provider() throws", () => {
  const { calls: workerManagerCalls, restore: restoreWM } = stubWorkerManagerTask()
  try {
    dispatchWorkerTask((x: number) => x, {
      mode: 'persisted',
      metaUrl: import.meta.url,
      provider: () => {
        throw new Error('no worker provider registered for this scope')
      },
    })(1)

    assertEquals(workerManagerCalls.length, 1)
  } finally {
    restoreWM()
  }
})

Deno.test("dispatchWorkerTask: mode 'persisted' with no provider resolves via getProviders", () => {
  const { calls: workerManagerCalls, restore: restoreWM } = stubWorkerManagerTask()
  const executeGeneralTaskCalls: unknown[] = []
  const restoreGetProviders = stubGetProviders((key) => {
    assertEquals(key, 'worker')
    return {
      executeGeneralTask: (fn: unknown, options: unknown) => {
        executeGeneralTaskCalls.push({ fn, options })
        return () => {}
      },
    }
  })
  try {
    dispatchWorkerTask((x: number) => x, {
      mode: 'persisted',
      metaUrl: import.meta.url,
    })(1)

    assertEquals(executeGeneralTaskCalls.length, 1)
    assertEquals(workerManagerCalls.length, 0)
  } finally {
    restoreGetProviders()
    restoreWM()
  }
})

Deno.test("dispatchWorkerTask: 'persisted' falls back to 'one-time' when nothing resolves", () => {
  const { calls: workerManagerCalls, restore: restoreWM } = stubWorkerManagerTask()
  const restoreGetProviders = stubGetProviders(() => {
    throw new Error('missing core provider slot')
  })
  try {
    dispatchWorkerTask((x: number) => x, {
      mode: 'persisted',
      metaUrl: import.meta.url,
    })(1)

    assertEquals(workerManagerCalls.length, 1)
  } finally {
    restoreGetProviders()
    restoreWM()
  }
})

Deno.test("dispatchWorkerTask: 'persisted' invokes callback through the provider's task", () => {
  const restoreGetProviders = stubGetProviders(() => ({
    executeGeneralTask: (
      _fn: unknown,
      options: { callback?: (r: unknown) => void },
    ) => {
      return (...args: unknown[]) => options.callback?.({ response: args, error: null })
    },
  }))
  try {
    const results: unknown[] = []
    dispatchWorkerTask((x: number) => x, {
      mode: 'persisted',
      metaUrl: import.meta.url,
      callback: (r) => results.push(r),
    })(1)

    assertEquals(results.length, 1)
    assertEquals((results[0] as { response: unknown[] }).response, [1])
  } finally {
    restoreGetProviders()
  }
})
