import type { MessageQueue, QueueMessageOptions, ScheduleOptions } from 'typings/queues.ts'
import type { ZanixAsyncmqConnector } from 'connectors/core/asyncmq.ts'
import type { CoreConnectorTemplates } from 'typings/targets.ts'
import type { ScopedContext } from '@zanix/server'

import ProgramModule from 'modules/program/mod.ts'
import { ZanixProvider } from '../base.ts'
import { InternalError } from '@zanix/errors'

/**
 * Abstract class representing an asynchronous message queue provider in the Zanix system.
 *
 * This class provides an interface for sending messages to queues and global topics asynchronously.
 * It is intended to be extended by concrete classes that implement specific MQ provider logic.
 *
 * @template T - The template type extending `CoreConnectorTemplates`. Defaults to `object` if not specified.
 *
 * @abstract
 * @extends {ZanixProvider<T>}
 */
export abstract class ZanixAsyncMQProvider<T extends CoreConnectorTemplates = object>
  extends ZanixProvider<T> {
  /**
   * **Note**: Use `this` to access the instance instead.
   */
  protected override get asyncmq(): never {
    throw new InternalError('Direct access to `asyncmq` is not allowed. Use `this` instead.', {
      meta: { source: 'zanix', provider: this.constructor.name },
    })
  }

  /**
   * Retrieves used asyncmq connector.
   *
   * @param {boolean} [verbose] - Enables verbose logging system during the process. Dedaults to `false`
   * @returns {ZanixAsyncmqConnector } - A connector of the specified type `ZanixAsyncmqConnector`.
   *
   * @remarks
   * This method dynamically retrieves the used connector based on the provided `asyncmq` key
   */
  public override use<ASMQ extends ZanixAsyncmqConnector>(
    verbose: boolean = false,
  ): ASMQ {
    return this.getProviderConnector('asyncmq', verbose)
  }

  /** Get a request context by ID */
  protected getContext(contextId: string): ScopedContext {
    return ProgramModule.context.getContext(contextId)
  }

  /**
   * Sends a message to a specific queue.
   *
   * @param {string} queue - The name of the queue to which the message will be sent.
   * @param {MessageQueue} message - The message to send, either as a string or an object.
   * @param {QueueMessageOptions} options - Additional options for sending the message. Type is not specified (deno-lint-ignore used).
   *
   * @returns {Promise<boolean>|boolean} A promise that resolves to `true` if the message was successfully sent, `false` otherwise.
   *
   * @abstract
   */
  public abstract enqueue(
    queue: string,
    message: MessageQueue,
    options: QueueMessageOptions & { isInternal?: boolean },
  ): Promise<boolean> | boolean

  /**
   * Sends a global message to a topic.
   *
   * @param {string} _topic - The name of the global topic to which the message will be sent.
   * @param {MessageQueue} _message - The message to send, either as a string or an object.
   * @param {QueueMessageOptions} _options - Additional options for sending the global message. Type is not specified (deno-lint-ignore used).
   *
   * @returns {Promise<boolean>|boolean} A promise that resolves to `true` if the global message was successfully sent, `false` otherwise.
   */
  public sendMessage(
    _topic: string,
    _message: MessageQueue,
    _options: QueueMessageOptions,
  ): Promise<boolean> | boolean {
    throw this['methodNotImplementedError']('sendMessage')
  }

  /**
   * Requeues all messages found in the Dead Letter Queue (DLQ) associated
   * with the specified queue.
   *
   * @param {string} _queue - The name of the queue whose Dead Letter Queue will be processed.
   * @returns {Promise<any[]>} A promise that resolves to an array of decoded messages.
   */
  // deno-lint-ignore no-explicit-any
  public requeueDeadLetters(_queue: string): Promise<any[]> {
    throw this['methodNotImplementedError']('requeueDeadLetters')
  }

  /**
   * Schedules a message to be published to a queue at a future time.
   *
   * The message can be scheduled either by specifying an absolute date or a delay
   * (in milliseconds). When `isInternal` is set, the queue name is resolved through
   * the internal queue path mechanism.
   *
   * @async
   * @param {string} _queue - The name of the queue where the message will be published.
   * @param {MessageQueue} _message - The message payload to send.
   *   It will be securely encoded before publication.
   * @param {Omit<QueueMessageOptions, 'expiration'> & ScheduleOptions} _options - Configuration options
   *   for scheduling and message publishing.
   * @param {boolean} [options.isInternal] - Whether the queue is internal and should be resolved
   *   through the internal queue path.
   * @param {Date} [options.date] - The absolute date at which the message should be delivered.
   *   If provided, it overrides `delay`.
   * @param {number} [options.delay] - Delay in milliseconds before the message is delivered.
   *   Used when `date` is not provided.
   *
   * @returns {Promise<boolean>|boolean} Resolves to `true` if the message was successfully scheduled.
   */
  public schedule(
    _queue: string,
    _message: MessageQueue,
    _options: Omit<QueueMessageOptions, 'expiration'> & ScheduleOptions,
  ): Promise<boolean> | boolean {
    throw this['methodNotImplementedError']('schedule')
  }
}
