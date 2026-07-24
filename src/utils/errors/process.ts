import { logAppError } from './helper.ts'

/**
 * Attach global error handlers on the provided execution context.
 *
 * This function captures:
 * - Uncaught runtime errors (`window.onerror`)
 * - Unhandled promise rejections (`unhandledrejection`)
 *
 * All captured errors are normalized and forwarded to `logAppError`
 * with a consistent error code and contextual message.
 *
 * Default browser error handling is prevented to avoid duplicate
 * logging or console noise.
 *
 * @param self - The execution context where global handlers are registered
 * (typically `window`, `self` in a Web Worker, or a Window-like global).
 *
 * @example
 * ```ts
 * attachGlobalErrorHandlers(window)
 * ```
 */
export const attachGlobalErrorHandlers: (self: Window) => void = (self): void => {
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
    }).catch(() => {})

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
  })
}
