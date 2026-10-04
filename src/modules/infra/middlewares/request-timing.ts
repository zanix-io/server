import type { MiddlewareInterceptor } from 'typings/middlewares.ts'
import type { ZanixGenericDecorator } from 'typings/decorators.ts'

import { InternalError } from '@zanix/errors'
import { serverTimingHeader } from '@zanix/helpers'
import { Interceptor } from 'middlewares/decorators/interceptor.ts'
import { REQUEST_STARTED_AT_LOCALS_KEY } from 'utils/constants.ts'
import logger from '@zanix/logger'
import type { LoggerMethods, LoggerTimer, LoggerTimerOptions } from '@zanix/logger'

/** The label every request-timing entry is logged under: a fixed name, never request data. */
export const REQUEST_TIMING_LABEL = 'http.request'

/** How many over-budget entries one timing interceptor persists per second, by default. */
export const DEFAULT_REQUEST_TIMING_MAX_LOGS_PER_SECOND = 10

/** The part of a logger the timing needs. Injectable, to use the app's own logger or to test. */
export type RequestTimingLogger = {
  /** Whether the logger handles entries of this level (its minimum level is not above it). */
  isLevelEnabled(level: LoggerMethods): boolean
  /** Starts a measurement, as `logger.timer` does. */
  timer(label: string, options?: LoggerTimerOptions): LoggerTimer
}

/** The options of {@link createTimingInterceptor}. */
export type TimingInterceptorOptions = {
  /**
   * A fixed name for what is measured, logged as `handler`: `'profile.edit'`, `'gestures.create'`.
   * Never built from the request: a URL carries ids and query strings that do not belong in a log.
   * An interceptor does not know which route it is bound to, so the name is how an entry says it.
   */
  name: string
  /**
   * The most milliseconds a request may take before it counts as slow. Required, with no default:
   * how long a route may take is a property of that route, not of the framework.
   */
  slowMs: number
  /**
   * What is logged besides a request over budget: `false` (the default) nothing; `true` one line at
   * `debug` for every request through this interceptor, printed and never persisted. Use `true`
   * while choosing `slowMs`, to see how long the route actually takes.
   *
   * @default false
   */
  logAll?: boolean
  /**
   * The most over-budget entries this interceptor persists per second. The extra ones are dropped
   * and the next persisted entry reports how many (`suppressed`).
   *
   * @default 10
   */
  maxLogsPerSecond?: number
  /**
   * Adds `Server-Timing: total;dur=<ms>` to the response. Anyone who can see the response can see it.
   *
   * @default false
   */
  serverTiming?: boolean
  /** The logger. Defaults to the shared `logger`. */
  log?: RequestTimingLogger
  /** A monotonic clock in milliseconds, the same one the start is read from. For tests. */
  clock?: () => number
}

const invalid = (message: string, meta: Record<string, unknown> = {}) =>
  new InternalError(`createTimingInterceptor: ${message}`, {
    meta: { source: 'zanix', method: 'createTimingInterceptor', ...meta },
  })

/** Appends `Server-Timing: total;dur=<ms>`; an immutable response is rebuilt around its body. */
const withServerTiming = (response: Response, durationMs: number): Response => {
  try {
    const value = serverTimingHeader([{ name: 'total', durationMs }])
    if (!value) return response

    try {
      response.headers.append('Server-Timing', value)
      return response
    } catch {
      const headers = new Headers(response.headers)
      headers.append('Server-Timing', value)
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
  } catch {
    return response
  }
}

/**
 * Builds an interceptor that measures how long the requests through it took and logs the ones over
 * the budget you give it. It is the only thing to register: no guard, no table of routes.
 *
 * A measuring tool, not a part of the server: nothing registers it and nothing in the default
 * pipeline refers to it. Register it when you want to measure (to look into a slow route, or to
 * check that a change made one faster) and take the registration out when you are done. While it is
 * not registered it has no cost and no effect.
 *
 * The request's start is read from `ctx.locals[REQUEST_STARTED_AT_LOCALS_KEY]`, which the dispatcher
 * writes when it creates the context, so the measurement covers everything between the request
 * reaching the dispatcher and this interceptor running: the guards, the pipes, the handler and the
 * interceptors registered before this one. Without a valid start (the key was deleted, or `locals`
 * was replaced by a middleware) nothing is measured, persisted or added to the response: a
 * measurement is never invented. A request that ends before the interceptor stage is not measured
 * (a guard that answers itself, a throw): the framework logs those errors with their context id.
 *
 * A request at or over `slowMs` is logged at `warn`, which persists, with `method`, `handler` (your
 * `name`), `httpStatus`, `contextId`, `durationMs` and `slowMs`; nothing else. Bodies, headers,
 * cookies, query strings and user ids are never part of an entry. At most `maxLogsPerSecond` are
 * persisted per second. The logger's minimum level applies: with `warn` dropped, and `serverTiming`
 * off, nothing is measured.
 *
 * @param {TimingInterceptorOptions} options - The name, the budget and the optional `logAll`, cap and
 * header.
 * @returns {MiddlewareInterceptor} The interceptor to register.
 * @throws {InternalError} If `name` is empty, `slowMs` is not a positive number, or another option
 * is out of range.
 * @example
 * ```ts
 * import { createTimingInterceptor, Interceptor } from '@zanix/server'
 *
 * class ProfilesController extends ZanixController {
 *   @Get('profile/:id')
 *   @Interceptor(createTimingInterceptor({ name: 'profile.get', slowMs: 400 }))
 *   public getProfile(ctx: HandlerContext) {}
 * }
 * ```
 */
export function createTimingInterceptor(options: TimingInterceptorOptions): MiddlewareInterceptor {
  const {
    name,
    slowMs,
    logAll = false,
    maxLogsPerSecond = DEFAULT_REQUEST_TIMING_MAX_LOGS_PER_SECOND,
    serverTiming = false,
    log = logger,
    clock = () => performance.now(),
  } = options

  if (typeof name !== 'string' || !name.trim()) {
    throw invalid('`name` must be a non-empty string.', { name })
  }
  if (typeof slowMs !== 'number' || !Number.isFinite(slowMs) || slowMs <= 0) {
    throw invalid(
      '`slowMs` must be a positive number of milliseconds. There is no default budget.',
      { name, slowMs },
    )
  }
  if (typeof logAll !== 'boolean') {
    throw invalid(
      `\`logAll\` must be \`true\` or \`false\`, got ${typeof logAll}. Pass a boolean, for ` +
        'example `logAll: Deno.env.get("MYAPP_TIMING") === "all"`.',
      { logAll },
    )
  }
  if (!Number.isInteger(maxLogsPerSecond) || maxLogsPerSecond < 1) {
    throw invalid('`maxLogsPerSecond` must be a positive integer.', { maxLogsPerSecond })
  }

  // The logger's minimum level is read once, here: with `warn` dropped no over-budget entry could
  // be kept, and with `debug` dropped `logAll: true` prints nothing. What neither level needs and no
  // header asks for is not measured, and the interceptor hands the response back as it came.
  const warnEnabled = log.isLevelEnabled('warn')
  const debugEnabled = logAll && log.isLevelEnabled('debug')
  if (!warnEnabled && !debugEnabled && !serverTiming) return (_, response) => response

  // The cap: a window of one second, restarted by the first over-budget request after it ends.
  let windowStart = -Infinity
  let persistedInWindow = 0
  let suppressed = 0
  const mayPersist = (now: number) => {
    if (now - windowStart >= 1000) {
      windowStart = now
      persistedInWindow = 0
    }
    if (persistedInWindow >= maxLogsPerSecond) {
      suppressed++
      return false
    }
    persistedInWindow++
    return true
  }

  /** A timer that reports exactly `durationMs`, so the logger formats and filters the entry. */
  const record = (level: 'warn' | 'debug', durationMs: number, data: Record<string, unknown>) => {
    try {
      let reads = 0
      log.timer(REQUEST_TIMING_LABEL, {
        level,
        metadata: data,
        clock: () => (reads++ === 0 ? 0 : durationMs),
      }).stop()
    } catch { /** Logging a measurement never changes the response. */ }
  }

  return (ctx, response) => {
    // The dispatcher writes the start into `locals` when it creates the context. A request without
    // a valid one is not measured, and its response goes back untouched: a missing key, a value
    // that is not a finite number, or one in the future (it cannot come from this clock) all mean
    // "no start known", never a duration made up from nothing.
    const startedAt = ctx.locals?.[REQUEST_STARTED_AT_LOCALS_KEY]
    if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return response

    const now = clock()
    const durationMs = now - startedAt
    if (durationMs < 0) return response
    const over = durationMs >= slowMs

    if (over && warnEnabled && mayPersist(now)) {
      const data: Record<string, unknown> = {
        method: ctx.req.method,
        handler: name,
        httpStatus: response.status,
        contextId: ctx.id,
        slowMs,
      }
      if (suppressed) {
        data.suppressed = suppressed
        suppressed = 0
      }
      record('warn', durationMs, data)
    } else if (debugEnabled) {
      record('debug', durationMs, {
        method: ctx.req.method,
        handler: name,
        httpStatus: response.status,
        contextId: ctx.id,
        slowMs,
      })
    }

    return serverTiming ? withServerTiming(response, durationMs) : response
  }
}

/** The options of {@link RequestTiming}: those of the interceptor, with `name` optional. */
export type RequestTimingDecoratorOptions =
  & Omit<TimingInterceptorOptions, 'name'>
  & {
    /**
     * A fixed name for what is measured, logged as `handler`. Defaults to the name of what is
     * decorated: the method's name on a method, the class's name on a class.
     */
    name?: string
  }

/**
 * Measures the requests to a handler (a method) or to every route of a handler class, and logs the
 * ones that take at least `slowMs`. It registers {@link createTimingInterceptor}'s interceptor on
 * that route the way `@Interceptor(...)` registers any interceptor, so it needs nothing else: the
 * decorator is the whole opt-in.
 *
 * It is explicit and off unless you write it: a handler without it is not measured and pays
 * nothing. `slowMs` is required, with no default. Put it on a handler while you measure (to look
 * into a slow route, or to check a change) and delete the line when you are done.
 *
 * On a method it measures that route; on a class, every route of the class, all logged under the
 * class's name (the entry's `method` tells a `GET` from a `POST`). A class decorator does not apply
 * to a subclass: decorate the subclass too. The measurement covers what runs before this
 * interceptor, so on a method keep it after the other interceptors you want counted.
 *
 * @param {RequestTimingDecoratorOptions} options - The budget and the optional name, `logAll`, cap and
 * header.
 * @returns {ZanixGenericDecorator} The decorator.
 * @throws {InternalError} If an option is invalid: when the decorator is applied, at load time.
 * @example
 * ```ts
 * import { Get, Post, RequestTiming, ZanixController, Controller } from '@zanix/server'
 *
 * @Controller('profiles')
 * class ProfilesController extends ZanixController {
 *   @Get(':id')
 *   @RequestTiming({ slowMs: 400 }) // logged as `getProfile`
 *   public getProfile(ctx: HandlerContext) {}
 *
 *   @Post()
 *   public create(ctx: HandlerContext) {} // not measured
 * }
 *
 * @Controller('reports')
 * @RequestTiming({ slowMs: 2500, name: 'reports' }) // every route of this class
 * class ReportsController extends ZanixController {}
 * ```
 */
export function RequestTiming(options: RequestTimingDecoratorOptions): ZanixGenericDecorator {
  return (target, context) => {
    const name = options.name ?? String(context?.name ?? target.name)
    Interceptor(createTimingInterceptor({ ...options, name }))(target, context)
  }
}
