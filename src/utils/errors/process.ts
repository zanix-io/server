import { logAppError } from './helper.ts'
import { recordUncaughtError } from './uncaught-error-monitor.ts'

/** {@linkcode attachGlobalErrorHandlers}'s second parameter. */
export interface AttachGlobalErrorHandlersOptions {
  /**
   * Called, then followed by `Deno.exit(1)`, once the uncaught-error monitor's own threshold is
   * crossed with `exitOnThreshold` enabled (see `UncaughtErrorMonitor`) — the caller's chance to
   * drain in-flight work first. Injected as a parameter, same as `self` itself, rather than
   * imported: this module never reaches into `modules/webserver/*` directly (see
   * `uncaught-error-monitor.ts`'s own doc for the import cycle that would reintroduce).
   */
  onUncaughtErrorThresholdExceeded?: () => Promise<void>
}

/**
 * Attach global error handlers on the provided execution context.
 *
 * This function captures:
 * - Uncaught runtime errors (`window.onerror`)
 * - Unhandled promise rejections (`unhandledrejection`)
 *
 * All captured errors are normalized and forwarded to `logAppError`
 * with a consistent error code and contextual message, then to the uncaught-error monitor
 * (`recordUncaughtError`, `uncaught-error-monitor.ts`) — once its own threshold is crossed with
 * `exitOnThreshold` enabled, `options.onUncaughtErrorThresholdExceeded` runs and the process exits.
 *
 * Default browser error handling is prevented to avoid duplicate
 * logging or console noise.
 *
 * @param self - The execution context where global handlers are registered
 * (typically `window`, `self` in a Web Worker, or a Window-like global).
 * @param options - See {@linkcode AttachGlobalErrorHandlersOptions}.
 *
 * @example
 * ```ts
 * attachGlobalErrorHandlers(window)
 * ```
 */
export const attachGlobalErrorHandlers: (
  self: Window,
  options?: AttachGlobalErrorHandlersOptions,
) => void = (
  self,
  options = {},
): void => {
  const handleThreshold = async (): Promise<void> => {
    let exceeded: boolean
    try {
      exceeded = await recordUncaughtError()
    } catch {
      // A broken custom `ErrorLogThrottleStore` must not also crash the error-handling path
      // itself — this is the same fire-and-forget contract `logAppError` above already has.
      return
    }
    if (!exceeded) return

    // The drain is best-effort: a failing/hanging callback must never prevent the exit this
    // threshold was configured to trigger in the first place.
    await options.onUncaughtErrorThresholdExceeded?.().catch(() => {})
    Deno.exit(1)
  }

  /** Catch all module errors */
  self.onerror = (event) => {
    event.preventDefault?.()
    const error = event.error || event
    // Fire-and-forget: onerror can't be awaited, but a rejection (e.g. a failing custom
    // ErrorLogThrottleStore) must not surface as an unhandled promise rejection.
    logAppError(error, {
      message: `An uncaught error has been detected: ${
        error?.message || error.toString() || 'Unknown'
      }`,
      code: 'UNCAUGHT_ERROR',
    })
      .catch(() => {})
      .then(handleThreshold)

    return true // Prevents the default error handling
  }

  self.addEventListener('unhandledrejection', async (event) => {
    event.preventDefault()
    await event.promise.catch(async (err) => {
      await logAppError(typeof err === 'string' ? { message: err } : err, {
        message: `An unhandled rejection error has been detected: ${
          event.reason?.message || err.message || err.toString() ||
          'Unknown'
        }`,
        code: 'UNHANDLED_PROMISE_REJECTION',
      })
    })
    await handleThreshold()
  })
}
