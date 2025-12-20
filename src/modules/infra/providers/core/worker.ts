import type { CoreConnectorTemplates } from 'typings/targets.ts'
import type { ScopedContext } from 'typings/context.ts'
import type { MessageQueue, QueueMessageOptions } from 'typings/queues.ts'
import type { TaskCallback } from '@zanix/types'

import ProgramModule from 'modules/program/mod.ts'
import { ZanixProvider } from '../base.ts'

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

  /** Get a request context by ID */
  protected getContext(contextId: string): ScopedContext {
    return ProgramModule.context.getContext(contextId)
  }
}
