import type { CoreConnectorTemplates } from 'typings/targets.ts'
import type { ScopedContext } from 'typings/context.ts'
import type { MessageQueue, QueueMessageOptions } from 'typings/queues.ts'
import type { TaskCallback } from '@zanix/types'

import ProgramModule from 'modules/program/mod.ts'
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
export abstract class ZanixWorkerProvider<T extends CoreConnectorTemplates = object>
  extends ZanixProvider<T> {
  #generalTasker = new WorkerManager({ pool: 3 })

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
   */
  public executeGeneralTask<T extends (...args: never[]) => unknown>(fn: T, options: {
    metaUrl: string
    callback?: TaskCallback
    timeout?: number
  }): (...parameters: Parameters<T>) => void {
    const { metaUrl, callback, timeout } = options
    const tasker = this.#generalTasker.task(fn, { metaUrl, onFinish: callback, timeout })
    return tasker.invoke.bind(tasker)
  }

  /** Get a request context by ID */
  protected getContext(contextId: string): ScopedContext {
    return ProgramModule.context.getContext(contextId)
  }
}
