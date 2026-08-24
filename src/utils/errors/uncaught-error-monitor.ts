import type { HealthCheckFn } from 'typings/server.ts'
import { errorLogThrottleStore } from './helper.ts'

/**
 * Occurrence counting for `attachGlobalErrorHandlers`'s two uncaught-error codes
 * (`UNCAUGHT_ERROR`/`UNHANDLED_PROMISE_REJECTION`) — a separate concern from
 * `ErrorLogThrottle`'s own (log-noise suppression for repeated HTTP-status errors), but the same
 * shape, reusing the exact same pluggable {@linkcode errorLogThrottleStore} (including whatever
 * distributed backend a consumer already installed via `setErrorLogThrottleStore`) under a
 * synthetic key that can never collide with a real HTTP status.
 *
 * Never installs anything on its own: `recordUncaughtError` is only ever called from
 * `attachGlobalErrorHandlers` itself, once per real uncaught error — importing this module has no
 * side effect, and it never reaches into `modules/webserver/*` (that would reintroduce the exact
 * import cycle `manager.ts` -> `utils/errors/process.ts` -> here -> `webserver/mod.ts` ->
 * `manager.ts` this package's own `WebServerManager#start` doc already avoids by injecting `self`
 * as a parameter instead of importing it).
 *
 * @module
 */

/** A status code is always a positive HTTP status — this key can never collide with one. */
const UNCAUGHT_ERROR_KEY = -1

/** Tunable knobs for {@linkcode recordUncaughtError} and {@linkcode uncaughtErrorRateCheck}. */
export interface UncaughtErrorMonitorConfig {
  /** Occurrences within `windowMs` before the process is considered unhealthy. Defaults to `10`. */
  threshold?: number
  /** Rolling window duration, in milliseconds. Defaults to `5` minutes. */
  windowMs?: number
  /**
   * Once `threshold` is crossed within `windowMs`, `recordUncaughtError` reports it (so
   * `attachGlobalErrorHandlers` drains and calls `Deno.exit(1)`) instead of only updating
   * {@linkcode uncaughtErrorRateCheck}'s readiness signal. Defaults to `false` — a process keeps
   * running, reporting `degraded` readiness only, unless a consumer explicitly opts into exiting.
   */
  exitOnThreshold?: boolean
}

/** Default values applied to {@linkcode UncaughtErrorMonitorConfig}; also usable to restore them. */
export const DEFAULT_UNCAUGHT_ERROR_MONITOR_CONFIG: Required<UncaughtErrorMonitorConfig> = {
  threshold: 10,
  windowMs: 5 * 60 * 1000,
  exitOnThreshold: false,
}

let uncaughtErrorMonitorConfig: Required<UncaughtErrorMonitorConfig> = {
  ...DEFAULT_UNCAUGHT_ERROR_MONITOR_CONFIG,
}

/**
 * Overrides the uncaught-error monitor's threshold, window, and/or whether crossing it exits the
 * process. Fields left unset keep their current value.
 */
export const setUncaughtErrorMonitorConfig = (config: UncaughtErrorMonitorConfig): void => {
  uncaughtErrorMonitorConfig = { ...uncaughtErrorMonitorConfig, ...config }
}

/**
 * Configures the uncaught-error monitor — the `ErrorLogThrottle` constructor-as-config-setter
 * idiom applied to this separate concern, for the same consumer-facing consistency.
 *
 * @example
 * Report `degraded` readiness (via {@linkcode uncaughtErrorRateCheck}) after 10 uncaught
 * errors/unhandled rejections within 5 minutes — the built-in default, spelled out explicitly:
 * ```ts
 * import { UncaughtErrorMonitor } from 'jsr:@zanix/server@[version]'
 *
 * new UncaughtErrorMonitor({ threshold: 10, windowMs: 5 * 60_000 })
 * ```
 *
 * @example
 * Also exit once that same threshold is crossed, so an external supervisor (systemd/PM2/a
 * container orchestrator's restart policy) restarts the process instead of leaving it running
 * indefinitely in a possibly-corrupted state:
 * ```ts
 * import { UncaughtErrorMonitor } from 'jsr:@zanix/server@[version]'
 *
 * new UncaughtErrorMonitor({ exitOnThreshold: true })
 * ```
 */
export class UncaughtErrorMonitor {
  /**
   * Installs the given options as the active uncaught-error-monitor configuration.
   *
   * @param {UncaughtErrorMonitorConfig} [options] - Fields left unset keep their current value.
   */
  constructor(options: UncaughtErrorMonitorConfig = {}) {
    setUncaughtErrorMonitorConfig(options)
  }
}

// Refreshed only when a REAL uncaught error is recorded — never by a `uncaughtErrorRateCheck` poll
// — so polling `/ready` never itself inflates the window. Self-heals: once `windowMs` passes with
// no further threshold-crossing occurrence, readiness reports healthy again on the next read.
let unhealthySince: number | undefined

/**
 * Records one uncaught error/unhandled rejection against the shared throttle store, updates
 * {@linkcode uncaughtErrorRateCheck}'s readiness signal whenever the count is at or above
 * `threshold` within the current window, and reports whether `attachGlobalErrorHandlers` should
 * drain and exit — `true` whenever that same at-or-above-`threshold` condition holds AND
 * {@linkcode UncaughtErrorMonitorConfig.exitOnThreshold} is enabled. In practice this fires only
 * once: `attachGlobalErrorHandlers` calls `Deno.exit(1)` as soon as it sees `true`, ending the
 * process before another uncaught error could call this again.
 *
 * TODO: with a distributed `ErrorLogThrottleStore` (a shared Redis/KV backend across replicas),
 * `unhealthySince` — and therefore `uncaughtErrorRateCheck` — only reflects occurrences THIS
 * replica itself recorded, even though the underlying count it compares against is shared. A
 * replica that never itself hits an uncaught error stays "healthy" here even while the shared
 * count crosses `threshold` from errors on other replicas. Making `uncaughtErrorRateCheck` itself
 * fleet-aware needs its own mechanism (e.g. a `peek`-style read against the shared store) — not
 * implemented.
 */
export async function recordUncaughtError(): Promise<boolean> {
  const { threshold, windowMs, exitOnThreshold } = uncaughtErrorMonitorConfig
  const count = await errorLogThrottleStore.increment(UNCAUGHT_ERROR_KEY, windowMs)

  if (count < threshold) return false

  unhealthySince = Date.now()

  return exitOnThreshold
}

/**
 * Ready-made {@linkcode HealthCheckFn} reflecting the uncaught-error monitor's own state — plug it
 * into `HealthOptions.checks` (`bootstrapServers({ health: { checks: { ... } } })` — `health` is a
 * sibling of `rest`/`graphql`/`socket`/`ssr`, not nested under any one of them, same as any other
 * custom check) to make `/ready` report `degraded` once `threshold` uncaught errors/unhandled
 * rejections occurred within `windowMs`. Never wired in automatically — the framework never assumes
 * a consumer wants uncaught-error state to affect their own readiness contract.
 */
export const uncaughtErrorRateCheck: HealthCheckFn = (): boolean => {
  if (unhealthySince === undefined) return true

  const recovered = Date.now() - unhealthySince > uncaughtErrorMonitorConfig.windowMs
  if (recovered) unhealthySince = undefined

  return recovered
}

/**
 * Clears {@linkcode uncaughtErrorRateCheck}'s "recently crossed threshold" state immediately,
 * without waiting out `windowMs` — the same manual-reset role `ErrorLogThrottleStore.reset` plays
 * for a single status's own count. Useful once a consumer has confirmed the underlying condition
 * is resolved, or to isolate tests from this module's shared state between runs.
 */
export function resetUncaughtErrorHealth(): void {
  unhealthySince = undefined
}
