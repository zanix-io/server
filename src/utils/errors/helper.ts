import { JSON_CONTENT_HEADER } from 'utils/constants.ts'
import { type HttpError, serializeError } from '@zanix/errors'
import { generateUUID } from '@zanix/helpers'
import logger from '@zanix/logger'

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_THRESHOLD = 50
const DEFAULT_MAX_STATUS = 500
const MIN_STATUS = 400

/**
 * Storage abstraction for the per-status error occurrence counters used by
 * {@link shouldNotLogError} to suppress log noise from repeated errors.
 *
 * The default implementation keeps counters in a local in-memory `Map`, which
 * only throttles within a single server instance. Provide a distributed
 * implementation (e.g. backed by Deno KV or Redis) via
 * {@link setErrorLogThrottleStore} to make the throttling apply across a
 * fleet of instances.
 *
 * This only needs to be best-effort: it powers log-noise suppression, not a
 * security control, so a small race on the very first `increment` of a new
 * window is an acceptable trade-off for a simple, backend-agnostic contract.
 *
 * `increment`/`reset` are plain functions with no `this` bound to any Zanix target, so
 * `this.cache`/`this.database` aren't available inside them. To reuse an already-registered
 * `SINGLETON` provider/connector (e.g. a custom Redis provider), resolve it via `ProgramModule`
 * instead (see the "Error Handling" guide's "Using a Zanix-managed provider/connector as the
 * backend" section for a full example) — it's a global singleton, so it works from a plain
 * function like this one just as well as from inside a class.
 */
export interface ErrorLogThrottleStore {
  /**
   * Increments the occurrence count for a status, starting a fresh window
   * (expiring after `windowMs`) if none is currently active, and returns the
   * count after incrementing.
   */
  increment(status: number, windowMs: number): Promise<number> | number
  /** Clears the count for a status so the next `increment` starts a fresh window. */
  reset(status: number): Promise<void> | void
}

const statusErrorLogThrottle = new Map<number, { value: number; expiredTime: number }>()

/** The default in-memory, single-instance {@link ErrorLogThrottleStore}. */
export const defaultErrorLogThrottleStore: ErrorLogThrottleStore = {
  increment: (status, windowMs) => {
    const now = Date.now()
    const entry = statusErrorLogThrottle.get(status)
    if (!entry || now > entry.expiredTime) {
      statusErrorLogThrottle.set(status, { value: 1, expiredTime: now + windowMs })
      return 1
    }
    entry.value++
    return entry.value
  },
  reset: (status) => {
    statusErrorLogThrottle.delete(status)
  },
}

let errorLogThrottleStore: ErrorLogThrottleStore = defaultErrorLogThrottleStore

/**
 * Overrides the store used to track error occurrences, e.g. to share the
 * counters across multiple server instances via Deno KV or Redis.
 *
 * @example
 * ```ts
 * setErrorLogThrottleStore({
 *   async increment(status, windowMs) {
 *     const value = await redis.incr(`err-log-throttle:${status}`)
 *     if (value === 1) await redis.pexpire(`err-log-throttle:${status}`, windowMs)
 *     return value
 *   },
 *   async reset(status) {
 *     await redis.del(`err-log-throttle:${status}`)
 *   },
 * })
 * ```
 */
export const setErrorLogThrottleStore = (store: ErrorLogThrottleStore) => {
  errorLogThrottleStore = store
}

/** Tunable knobs for the error-occurrence throttling done by {@link shouldNotLogError}. */
export interface ErrorLogThrottleConfig {
  /** Occurrences of the same status within `windowMs` before the error is logged once and the window resets. Defaults to `50`. */
  threshold?: number
  /** Rolling window duration, in milliseconds, used to bound the occurrence count. Defaults to one hour. */
  windowMs?: number
  /**
   * Exclusive upper bound (status `< maxStatus`) of the range subject to throttling. Defaults to
   * `500`, so server errors are always logged, never suppressed. Raising this above `500` brings
   * server errors into the throttled range too — useful to tame a flaky downstream dependency,
   * but it means a burst of identical server errors can go silently unlogged until the window
   * resets, so only raise it if you've accepted that trade-off.
   *
   * There's no equivalent lower bound: statuses below `400` aren't errors (2xx is success, 3xx is
   * a redirect), so that boundary is fixed and not configurable.
   */
  maxStatus?: number
  /**
   * Status codes that bypass throttling entirely and are always logged, even though they fall
   * within the throttled range (`>= 400` and `< maxStatus`). Useful to keep specific error types
   * (e.g. `401` for auth failures) fully visible while still throttling noisier ones. Defaults to
   * `[]` (nothing excluded).
   */
  excludeStatuses?: number[]
}

/** Default values applied to {@link ErrorLogThrottleConfig}; also usable to restore them. */
export const DEFAULT_ERROR_LOG_THROTTLE_CONFIG: Required<ErrorLogThrottleConfig> = {
  threshold: DEFAULT_THRESHOLD,
  windowMs: HOUR_MS,
  maxStatus: DEFAULT_MAX_STATUS,
  excludeStatuses: [],
}

let errorLogThrottleConfig: Required<ErrorLogThrottleConfig> = {
  ...DEFAULT_ERROR_LOG_THROTTLE_CONFIG,
}

/**
 * Overrides the threshold and/or rolling window used to suppress log noise from repeated
 * errors of the same status. Fields left unset keep their current value.
 *
 * @example
 * ```ts
 * setErrorLogThrottleConfig({ threshold: 100, windowMs: 10 * 60 * 1000 }) // 100 errors / 10 min
 * ```
 */
export const setErrorLogThrottleConfig = (config: ErrorLogThrottleConfig) => {
  errorLogThrottleConfig = { ...errorLogThrottleConfig, ...config }
}

/**
 * Configures the error-log throttling that {@link shouldNotLogError} applies to repeated
 * HTTP errors (status `>= 400` and, by default, `< 500`) so they don't flood the logs: by default,
 * up to `50` occurrences of the same status within a rolling `1`-hour window are silently skipped,
 * the 50th is logged once with a `meta` note explaining why, and the window then restarts.
 *
 * All tracking is local, in-memory, and per-process by default — each server instance keeps its
 * own count. Pass a `store` to share the count across a fleet of instances (e.g. via Deno KV or
 * Redis); see {@link ErrorLogThrottleStore} for the contract it must implement.
 *
 * Instantiate once during application startup, e.g. right before `bootstrapServers`. Only the
 * options you pass are changed — anything omitted keeps its current value (the built-in defaults,
 * if this is the first call).
 *
 * @example
 * Loosen the default throttle to 100 occurrences per 10-minute window:
 * ```ts
 * import { ErrorLogThrottle } from 'jsr:@zanix/server@[version]'
 *
 * new ErrorLogThrottle({ threshold: 100, windowMs: 10 * 60_000 })
 * ```
 *
 * @example
 * Share the count across every replica via Redis instead of tracking it per-instance:
 * ```ts
 * import { ErrorLogThrottle } from 'jsr:@zanix/server@[version]'
 *
 * new ErrorLogThrottle({
 *   store: {
 *     async increment(status, windowMs) {
 *       const value = await redis.incr(`err-log-throttle:${status}`)
 *       if (value === 1) await redis.pexpire(`err-log-throttle:${status}`, windowMs)
 *       return value
 *     },
 *     async reset(status) {
 *       await redis.del(`err-log-throttle:${status}`)
 *     },
 *   },
 * })
 * ```
 *
 * @example
 * Also throttle server errors (>= 500), which are otherwise always logged unsuppressed — only do
 * this if you've accepted that a burst of identical server errors can go silently unlogged until
 * the window resets:
 * ```ts
 * import { ErrorLogThrottle } from 'jsr:@zanix/server@[version]'
 *
 * new ErrorLogThrottle({ maxStatus: 600 })
 * ```
 *
 * @example
 * Throttle 4xx noise in general, but always keep auth failures fully visible:
 * ```ts
 * import { ErrorLogThrottle } from 'jsr:@zanix/server@[version]'
 *
 * new ErrorLogThrottle({ excludeStatuses: [401, 403] })
 * ```
 */
export class ErrorLogThrottle {
  /**
   * Installs the given options as the active error-log-throttle configuration.
   *
   * @param {Object} [options] - Fields left unset keep their current value.
   * @param {ErrorLogThrottleStore} [options.store] - Backend to install as the active store.
   * @param {number} [options.threshold] - Occurrences before an error is logged once and the window resets.
   * @param {number} [options.windowMs] - Rolling window duration, in milliseconds.
   * @param {number} [options.maxStatus] - Exclusive upper bound of the throttled status range; raise above `500` to also throttle server errors.
   * @param {number[]} [options.excludeStatuses] - Status codes that always bypass throttling and are logged every time.
   */
  constructor(options: ErrorLogThrottleConfig & { store?: ErrorLogThrottleStore } = {}) {
    const { store, ...config } = options
    if (store) setErrorLogThrottleStore(store)
    setErrorLogThrottleConfig(config)
  }
}

/**
 * Function to get http status error
 * @param {unknown} error - The error object to be processed.
 */
export const getStatusError = (error: unknown) => {
  const e = error as HttpError
  if (typeof e?.status?.value === 'number') {
    return e.status.value
  }
}

/**
 * Determines whether an error should be logged.
 *
 * The error will be logged if the '_logged' property does not exist (unknown errors).
 * The error will not be logged if '_logged' is true (indicating it has already been logged).
 * The error will not be logged if '_logged' is false (explicitly marked not to log).
 *
 * @remarks
 * Exceptions:
 *  - Repeated HTTP errors will be logged once the throttle threshold is hit, even if their
 *    `_logged` property is `false`.
 *  - Errors with an HTTP status code of 500 or higher (server errors) will always be logged,
 *    regardless of the `_logged` property value — unless {@link ErrorLogThrottleConfig.maxStatus}
 *    has been raised above `500`, in which case server errors are throttled too.
 *  - Statuses listed in {@link ErrorLogThrottleConfig.excludeStatuses} always bypass throttling
 *    and are logged every time, even if otherwise within the throttled range.
 */
export const shouldNotLogError = async (e: unknown): Promise<boolean> => {
  const isKnownError = e && typeof e === 'object' && '_logged' in e &&
    typeof e._logged === 'boolean'

  if (!isKnownError) return false
  if (e._logged === true) return true

  const errorStatus = getStatusError(e)

  if (!errorStatus || errorStatus < MIN_STATUS) return true

  const { threshold, windowMs, maxStatus, excludeStatuses } = errorLogThrottleConfig

  if (errorStatus >= maxStatus || excludeStatuses.includes(errorStatus)) return false

  const count = await errorLogThrottleStore.increment(errorStatus, windowMs)

  // Check if the occurrence count has reached the configured threshold within the window
  if (count >= threshold) {
    await errorLogThrottleStore.reset(errorStatus)

    const metaError = {
      reason: `Error rate exceeded: ${threshold} errors within ${windowMs}ms`,
      description:
        `Error triggered by exceeding ${threshold} errors within the configured window, possibly due to system overload or recurring issues.`,
      resolution: 'Check system load or request patterns to address potential causes.',
    }

    if ('meta' in e && typeof e.meta === 'object') {
      e.meta = { ...e.meta, ...metaError }
    } else {
      ;(e as Record<string, unknown>).meta = metaError
    }

    return false
  }

  return true
}

/**
 * Function to get extended error response
 *
 * @param {unknown} error - The error object to be processed.
 * @param {string} [contextId] - Optional request context id to be sent with the error.
 * @param {boolean} [withStackTrace] - Optional stack trace flag serializaion
 */
export const getExtendedErrorResponse = (
  // deno-lint-ignore no-explicit-any
  error: any,
  contextId?: string,
  withStackTrace: boolean = false,
  // deno-lint-ignore no-explicit-any
): Record<string, any> => {
  if (!error) error = {}
  const props: Record<string, unknown> = {
    id: error?.id || generateUUID(),
  }
  if (contextId) props.contextId = contextId

  return Object.assign({}, serializeError(error, { withStackTrace }), props)
}

/**
 * Serializes an error into a format suitable for inclusion in an stringify response.
 * This method prepares the error object by converting it into a structured representation
 * that can be safely sent to the client.
 *
 * @param {unknown} error - The error object to be processed.
 * @param {string} [contextId] - Optional request context id to be sent with the error.
 */
export const getSerializedErrorResponse = (error: unknown, contextId?: string): string => {
  const extendedError = getExtendedErrorResponse(error, contextId)

  return JSON.stringify(extendedError)
}

/**
 * Generates an HTTP Response for an error with an appropriate status code and headers.
 *
 * This function processes an error, formats it using `getSerializedErrorResponse`, and returns an HTTP response.
 * The response status is determined based on the `status` property in the error object. If no status is provided,
 * a default status code of 400 (Bad Request) is used.
 * Additionally, custom headers can be provided, which will be merged with the default headers.
 *
 * @param {unknown} error - The error object to be processed. The error should contain a `status` field with a `value`
 *                           that determines the response status code. If not, a 400 status is used.
 * @param {Object} [options={}] - Additional response options.
 * @param {Record<string, unknown>} [options.headers={}] - Optional additional headers to be included in the response. These headers
 *                                                 will be merged with the default `JSON_CONTENT_HEADER`.
 * @param {string} [options.contextId] - Optional request context id to be sent with the error.
 *
 * @returns {Response} A Response object containing the formatted error message and status code.
 *
 * @example
 * const error = { status: { value: 404 }, message: "Not Found" };
 * const response = httpErrorResponse(error);
 * console.log(response.status); // 404
 * console.log(response.headers.get("Content-Type")); // "application/json"
 */
export const httpErrorResponse = (
  error: unknown,
  options: { headers?: Record<string, unknown>; contextId?: string } = {},
): Response => {
  const { headers, contextId } = options
  return new Response(getSerializedErrorResponse(error, contextId), {
    headers: { ...JSON_CONTENT_HEADER, ...headers },
    status: getStatusError(error) || 400,
  })
}

/**
 * Logs a app error with optional additional details.
 *
 * @param {unknown} e - The original error being logged.
 * @param {Object} options - The options object containing error details.
 * @param {string} options.message - The error message describing the issue.
 * @param {string} options.code - A unique code representing the error.
 * @param {Record<string, unknown>} [options.meta] - Optional metadata related to the error (e.g., stack trace or additional context).
 * @param {string} [options.contextId] - An optional identifier for the request context, useful for correlating errors with specific requests.
 */
export const logAppError = async (
  e: unknown,
  options: { message: string; code: string; meta?: Record<string, unknown>; contextId?: string },
) => {
  if (await shouldNotLogError(e)) return

  const { message, code, meta, contextId } = options
  const withStackTrace = true

  const error = getExtendedErrorResponse(
    e,
    contextId,
    withStackTrace,
  )

  error.code = error.code || code
  if (error.meta || meta) error.meta = { ...meta, ...error.meta }

  try {
    Object.assign(e as never, { id: error.id, contextId: error.contextId })
  } catch { /** ignore */ }

  logger.error(message, error)
}
