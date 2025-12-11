import type { CoreConnectorTemplates } from 'typings/targets.ts'
import type { QueueMessageOptions } from 'typings/queues.ts'

import ProgramModule from 'modules/program/mod.ts'
import { ZanixProvider } from '../base.ts'
import { InternalError } from '@zanix/errors'
import type { ScopedContext } from '@zanix/server'

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

  /** Get a request context by ID */
  protected getContext(contextId: string): ScopedContext {
    return ProgramModule.context.getContext(contextId)
  }

  /**
   * Sends a message to a specific queue.
   *
   * @param {string} queue - The name of the queue to which the message will be sent.
   * @param {string | Record<string, unknown>} message - The message to send, either as a string or an object.
   * @param {QueueMessageOptions} options - Additional options for sending the message. Type is not specified (deno-lint-ignore used).
   *
   * @returns {Promise<boolean>} A promise that resolves to `true` if the message was successfully sent, `false` otherwise.
   *
   * @abstract
   */
  public abstract sendMessage(
    queue: string,
    message: string | Record<string, unknown>,
    options: QueueMessageOptions & { isLocal?: boolean },
  ): Promise<boolean>

  /**
   * Sends a global message to a topic.
   *
   * @param {string} _topic - The name of the global topic to which the message will be sent.
   * @param {string | Record<string, unknown>} _message - The message to send, either as a string or an object.
   * @param {QueueMessageOptions} _options - Additional options for sending the global message. Type is not specified (deno-lint-ignore used).
   *
   * @returns {Promise<boolean>} A promise that resolves to `true` if the global message was successfully sent, `false` otherwise.
   */
  public sendGlobalMessage(
    _topic: string,
    _message: string | Record<string, unknown>,
    _options: QueueMessageOptions,
  ): Promise<boolean> {
    throw this['methodNotImplementedError']('sendGlobalMessage')
  }
}
