import type { StartMode } from 'typings/program.ts'
import type { ErrorOptions } from '@zanix/types'

import { HttpError, InternalError } from '@zanix/errors'

/**
 * Handles target-related errors based on the provided start mode.
 *
 * @param message - A string describing the error that occurred.
 * @param startMode - The current start mode; if it is not `'lazy'`, an interruption error is thrown.
 * @param options - The optional error info.
 *
 * @return {InternalError | HttpError}
 * - InternalError: When the start mode is not `'lazy'`.
 * - HttpError: When the start mode is `'lazy'`, an HTTP error with status `INTERNAL_SERVER_ERROR` is thrown.
 */
export class TargetError {
  constructor(
    message: string,
    startMode: StartMode,
    options?: Omit<ErrorOptions, 'message'>,
  ) {
    if (startMode !== 'lazy') return new InternalError(message, options)
    return new HttpError('INTERNAL_SERVER_ERROR', { message, ...options })
  }
}
