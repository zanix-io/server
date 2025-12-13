type Publish = {
  expiration?: string | number
  userId?: string
  CC?: string | string[]

  mandatory?: boolean
  persistent?: boolean
  deliveryMode?: boolean | number
  BCC?: string | string[]

  contentType?: string
  contentEncoding?: string
  headers?: Record<string, unknown>
  correlationId?: string
  replyTo?: string
  messageId?: string
  timestamp?: number
  type?: string
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
