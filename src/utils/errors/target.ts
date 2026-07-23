import type { StartMode } from 'typings/program.ts'
import type { ErrorOptions } from '@zanix/types'

import { HttpError, InternalError } from '@zanix/errors'

/**
 * Builds the appropriate error instance for a target-related failure, based on the provided start mode.
 *
 * `TargetError` is a factory disguised as a class: due to the constructor's explicit `return`,
 * `new TargetError(...)` never yields a `TargetError` instance — it directly returns an
 * `InternalError` or `HttpError` instance instead. This class does **not** throw by itself;
 * callers are responsible for `throw`ing (or otherwise using) the returned error.
 *
 * @param message - A string describing the error that occurred.
 * @param startMode - The current start mode; determines which error type is constructed.
 * @param options - The optional error info.
 *
 * @returns {InternalError | HttpError}
 * - InternalError: When the start mode is not `'lazy'`.
 * - HttpError: When the start mode is `'lazy'`, with status `INTERNAL_SERVER_ERROR`.
 *
 * @example
 * ```ts
 * throw new TargetError('Connector not ready', startMode, { meta: { target: 'MyConnector' } })
 * ```
 */
export class TargetError {
  /** Builds and returns the `InternalError` or `HttpError` instance for the given start mode. */
  constructor(
    message: string,
    startMode: StartMode,
    options?: Omit<ErrorOptions, 'message'>,
  ) {
    if (startMode !== 'lazy') return new InternalError(message, options)
    return new HttpError('INTERNAL_SERVER_ERROR', { message, ...options })
  }
}
