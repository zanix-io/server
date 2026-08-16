import type { CoreModules } from 'typings/targets.ts'
import type { ScopedContext } from 'typings/context.ts'
import type { MessageQueue, QueueMessageOptions } from 'typings/queues.ts'
import type { TaskCallback, TaskFunction } from '@zanix/types'

import ProgramModule from 'modules/program/mod.ts'
import PublicProgramModule from 'modules/program/public.ts'
import { ZanixProvider } from '../base.ts'
import { WorkerManager } from '@zanix/workers'

/**
 * Abstract base class for providers that integrate with background job or worker systems.
 *
 * This class extends {@link ZanixProvider} and is designed to be the foundation for implementing
 * providers to background processing tools using `ZanixWorkerConnectors`
 *
 * It inherits lifecycle and connection state management from `ZanixProvider`,
 * ensuring reliable initialization and teardown of worker-related services.
 *
 * Extend this class to implement custom providers for job schedulers, workers, or task queues.
 *
 * @abstract
 * @extends ZanixProvider
 */
export abstract class ZanixWorkerProvider<T extends CoreModules = object> extends ZanixProvider<T> {
  #generalTasker
  /**
   * Creates the provider and its backing worker pool.
   *
   * @param contextId - Optional scope for this provider instance.
   * @param pool - Worker pool size backing {@link executeGeneralTask}. Defaults to `3`.
   * @param permissions - Restricts what EVERY worker in this pool may do (`net`/`read`/`write`/
   * `env`/`run`/`ffi`/`sys`) — forwarded as-is to `WorkerManager`'s own `permissions` option. Omit
   * entirely (the default) for unchanged, unrestricted behavior — every existing subclass keeps
   * working exactly as before. Fixed for this pool's entire lifetime; a subclass needing DIFFERENT
   * permission profiles for different tasks needs a SEPARATE `ZanixWorkerProvider` per profile, not
   * one shared pool (same reasoning `WorkerManager`'s own `permissions` option doc gives).
   */
  constructor(
    contextId?: string,
    pool = 3,
    permissions: Deno.PermissionOptions | undefined = undefined,
  ) {
    super(contextId)
    this.#generalTasker = new WorkerManager({ pool, permissions })
  }

  /**
   * Executes a Job asynchronously (e.g. via AsyncMQ).
   *
   * @param name - Registered job name
   * @param options
   * @param options.contextId - Optional execution context
   * @param options.args - Payload sent to the job
   * @param options.settings - Additional options for publishing the queue message.
   */
  abstract runJob(
    name: string,
    options?: {
      contextId?: string
      args?: MessageQueue
      settings?: Omit<QueueMessageOptions, 'contextId' | 'isInternal'>
    },
  ): Promise<boolean> | boolean

  /**
   * Executes a Task locally.
   *
   * @param name - Registered task/job name
   * @param options
   * @param options.args - Arguments passed to the task
   * @param options.contextId - Optional execution context
   * @param options.callback - Callback executed on task completion
   * @param options.timeout - Maximum execution time in ms
   */
  abstract runTask(
    name: string,
    options?: {
      args?: MessageQueue
      contextId?: string
      callback?: TaskCallback
      timeout?: number
    },
  ): boolean

  /**
   * Executes a general task using a default WorkerManager instance with 3 workers.
   * Use this method for moderate or light tasks where no dependency injection is required.
   *
   * @template T
   * @param {T} fn - The function to be executed in the worker thread. It must not accept any arguments.
   * @param {Object} options - Options to configure the task execution.
   * @param {string} options.metaUrl - The URL of the metadata required for the task.
   * @param {TaskCallback} [options.callback] - A callback function to be invoked when the task finishes.
   * @param {number} [options.timeout] - The maximum time (in milliseconds) before the task is aborted.
   * @param {boolean} [options.verbose=true] - Whether to print detailed information about the operation.
   */
  public executeGeneralTask<T extends (...args: never[]) => unknown>(
    fn: T,
    options: {
      metaUrl: string
      callback?: TaskCallback
      verbose?: boolean
      timeout?: number
    },
  ): (...parameters: Parameters<T>) => void {
    const { metaUrl, callback, timeout, verbose } = options
    const tasker = this.#generalTasker.task(fn, {
      metaUrl,
      onFinish: callback,
      timeout,
      verbose,
    })
    return tasker.invoke.bind(tasker)
  }

  /** Get a request context by ID */
  protected getContext(contextId: string): ScopedContext {
    return ProgramModule.context.getContext(contextId)
  }
}

/**
 * Dispatch strategy for {@link dispatchWorkerTask}.
 *
 * - `'one-time'`: a fresh, throwaway `WorkerManager` instance is created for the call and closed
 *   once it finishes — no persistent worker pool, no DI resolution.
 * - `'persisted'`: reuses the app's `'worker'` core-provider pool
 *   ({@link ZanixWorkerProvider.executeGeneralTask}) instead of paying worker startup cost on every
 *   call. Falls back to `'one-time'` behavior automatically when that provider can't be resolved
 *   (e.g. outside a booted Zanix Core application, or no `'worker'` slot implementation registered)
 *   — always safe to request regardless of runtime.
 */
export type WorkerDispatchMode = 'one-time' | 'persisted'

/** Options for {@link dispatchWorkerTask}. */
export interface WorkerDispatchOptions {
  /** Which dispatch strategy to use — see {@link WorkerDispatchMode}. */
  mode: WorkerDispatchMode
  /** The worker task's own `metaUrl` — see `WorkerManager.task`'s `metaUrl` option. */
  metaUrl: string
  /** Invoked once the task finishes, on either dispatch path — same shape both ways. */
  callback?: TaskCallback
  /** Maximum execution time (ms) before the task is aborted. */
  timeout?: number
  /**
   * Forwarded to the underlying `WorkerManager` task — logs a worker-side error through the
   * shared logger when `true` (the `WorkerManager` default). Set `false` when `callback` already
   * reports failures itself, to avoid double-logging. Never affects whether `'persisted'` falls
   * back to `'one-time'` — that fallback is always silent, regardless of this option.
   */
  verbose?: boolean
  /**
   * Resolves a `'worker'` core provider already scoped by the caller — pass `() => this.worker`
   * when calling from inside a `ZanixProvider`/`ZanixConnector`/`ZanixInteractor` subclass, so
   * `'persisted'` mode reuses that instance's own already-scoped resolution instead of a second,
   * unscoped global lookup. Only consulted when `mode` is `'persisted'`. Omit from a free function
   * with no `this` (e.g. a `SaveDataFunction` factory) — {@link dispatchWorkerTask} then resolves
   * the `'worker'` provider itself, globally.
   *
   * **Deliberately a function, not a resolved value**: `this.worker` throws synchronously when no
   * `'worker'` provider is registered — the same condition `'persisted'` is meant to fall back
   * from silently. Passing `this.worker` directly (eagerly evaluated while building this options
   * object) would throw before {@link dispatchWorkerTask} ever runs, escaping its own fallback
   * entirely; passing `() => this.worker` defers that throw to inside the same `try`/`catch` the
   * global-lookup fallback already uses.
   */
  provider?: () => ZanixWorkerProvider
}

/**
 * Dispatches `fn` to a worker thread, either via a one-time `WorkerManager` instance or the app's
 * persisted `'worker'` core-provider pool — see {@link WorkerDispatchMode} for the two strategies
 * and the automatic fallback `'persisted'` gets when that provider isn't available.
 *
 * Returns a bound `invoke` function — mirroring `WorkerManager.task(...).invoke`/
 * `ZanixWorkerProvider.executeGeneralTask(...)`'s own shape — deliberately not Promise-returning,
 * so the caller keeps deciding whether the dispatch is awaited or fire-and-forget; wrap the
 * returned function in a `new Promise(...)` around `options.callback` when a caller needs to await
 * completion (see `@zanix/datamaster`'s `elasticsearchLogSave` for the reference pattern).
 *
 * @template T - The task function's signature — must accept only structured-cloneable arguments.
 * @param fn - The function to run inside the worker thread.
 * @param options - See {@link WorkerDispatchOptions}.
 *
 * @example
 * ```ts
 * const invoke = dispatchWorkerTask(myTask, {
 *   mode: 'persisted',
 *   metaUrl: import.meta.url,
 *   callback: ({ error }) => { if (error) console.error(error) },
 * })
 * invoke('some-argument')
 * ```
 */
export function dispatchWorkerTask<T extends TaskFunction>(
  fn: T,
  options: WorkerDispatchOptions,
): (...parameters: Parameters<T>) => void {
  const { mode, metaUrl, callback, timeout, verbose, provider } = options

  if (mode === 'persisted') {
    try {
      const worker = provider ? provider() : PublicProgramModule.getProviders(undefined, false).get<
        ZanixWorkerProvider
      >('worker')
      return worker.executeGeneralTask(fn, {
        metaUrl,
        callback,
        timeout,
        verbose,
      })
    } catch {
      // No 'worker' core provider registered/resolvable — fall through to 'one-time' below.
    }
  }

  const tasker = new WorkerManager().task(fn, {
    metaUrl,
    autoClose: true,
    timeout,
    verbose,
    onFinish: callback,
  })
  return tasker.invoke.bind(tasker)
}
