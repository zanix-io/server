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
