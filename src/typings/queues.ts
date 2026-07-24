/** AMQP-style publish options accepted when enqueuing a message (headers, priority hints, etc). */
export type Publish = {
  /**
   * If supplied, the message will be discarded from a queue once it's been there
   * longer than the given number of milliseconds.
   */
  expiration?: string | number
  /** Identifies the user publishing the message, and, if set, must match the AMQP connection's user name. */
  userId?: string
  /** A list of routing keys to which the message should additionally be delivered (carbon copy). */
  CC?: string | string[]

  /** If true, the message is returned if it is not routed to a queue. */
  mandatory?: boolean
  /** If truthy, the message will survive broker restarts, provided it's in a queue that also survives restarts. */
  persistent?: boolean
  /** Marks the delivery mode of the message; overridden internally when `persistent` is set. */
  deliveryMode?: boolean | number
  /** Like `CC`, but the recipients are not included in the message headers seen by consumers. */
  BCC?: string | string[]

  /** A MIME type for the message content, e.g., `'application/json'`. */
  contentType?: string
  /** A MIME encoding for the message content, e.g., `'gzip'`. */
  contentEncoding?: string
  /** Application-specific headers to be carried along with the message content. */
  headers?: Record<string, unknown>
  /** Usually used to match the response to a request, in RPC-style messaging. */
  correlationId?: string
  /** Often used to name a queue to which the receiving application must send replies, in RPC-style messaging. */
  replyTo?: string
  /** Arbitrary application-specific identifier for the message. */
  messageId?: string
  /** A timestamp for the message, in seconds since the Unix epoch. */
  timestamp?: number
  /** An arbitrary application-specific message type. */
  type?: string
  /** An arbitrary identifier for the originating application. */
  appId?: string
}
/** Queue Priority Types */
export type QueuePriorities = 'low' | 'medium' | 'high'

/** Queue Message Options */
export type QueueMessageOptions = Publish & {
  /**
   * Defines the priority assigned to a published message.
   *
   * This value can be either:
   *  - A numeric AMQP priority (typically in the range 0–9 or 0–255 depending on
   *    the queue's `maxPriority` configuration), or
   *  - A semantic priority label defined by `QueuePriorities` (e.g., "low",
   *    "medium", "high"), which the system maps internally to a numeric value.
   *
   * Higher priority messages are delivered before lower priority ones, provided
   * that the target queue supports priority (i.e., was created with `maxPriority`).
   */
  priority?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | QueuePriorities
  /** Retry configuration for queue message processing. */
  retryConfig?: {
    /**
     * Maximum number of retry attempts before the message is considered failed.
     * Defaults to `0` (no retries) if not specified.
     */
    maxRetries?: number
    /**
     * The optional `options` for Backoff strategy
     */
    backoffOptions?: BackoffOptions
  }
  /** Request context id */
  contextId: string | undefined
  /**
   * Whether the queue is internal and should be resolved
   * through the internal queue path.
   */
  isInternal?: boolean
}

/** The options for Backoff strategy */
export type BackoffOptions = {
  /**
   * Base timeout (in milliseconds) used when calculating exponential backoff.
   * Common default is `15000` (15 seconds).
   */
  exponentialTimeout?: number
  /**
   * Multiplier applied on each retry attempt when computing exponential backoff.
   * Defaults to `2` (doubling the delay per attempt).
   */
  exponentialBackoffCoefficient?: number
} & Record<string, unknown>

/**
 * Options for scheduling a task.
 *
 * You can specify the schedule in **one of two mutually exclusive ways**:
 *
 * 1. `date`: Run the task at a specific Date/Time.
 *    ```ts
 *    { date: new Date("2025-12-12T10:00:00Z") }
 *    ```
 * 2. `delay`: Run the task after a delay in milliseconds.
 *    ```ts
 *    { delay: 60000 } // 1 minute
 *    ```
 *
 * @property {Date} [date] The specific date/time when the task should run.
 *   Mutually exclusive with `delay`.
 *
 * @property {number} [delay] Delay in milliseconds after which the task should run.
 *   Mutually exclusive with `date`
 */
export type ScheduleOptions = { date: Date; delay?: number } | { date?: Date; delay: number }

/** Handler message type */
export type MessageQueue = string | Record<string, unknown> | null
