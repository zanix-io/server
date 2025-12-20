import { JSON_CONTENT_HEADER } from 'utils/constants.ts'
import { type HttpError, serializeError } from '@zanix/errors'
import { generateUUID } from '@zanix/helpers'
import logger from '@zanix/logger'

// TODO: implement status error concurrency by server id and saved in kv or cache
export const statusErrorConcurrency = new Map<number, { value: number; expiredTime: number }>()

export const setErrorConcurrency = (errorStatus: number) => {
  const expiredTime = Date.now() + 60 * 60 * 1000 // 1 hour
  statusErrorConcurrency.set(errorStatus, { value: 0, expiredTime })
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
 *  - Concurrent HTTP errors will be logged, even if their `_logged` property is `false`.
 *  - Errors with an HTTP status code of 500 or higher (server errors) will always be logged,
 *    regardless of the `_logged` property value.
 */
export const shouldNotLogError = (e: unknown): boolean => {
  const isKnownError = e && typeof e === 'object' && '_logged' in e &&
    typeof e._logged === 'boolean'

  if (!isKnownError) return false
  if (e._logged === true) return true

  const errorStatus = getStatusError(e)

  if (!errorStatus || errorStatus < 400) return true

  if (errorStatus >= 500) return false

  const errorQuantity = statusErrorConcurrency.get(errorStatus)
  if (errorQuantity !== undefined) {
    if (Date.now() > errorQuantity.expiredTime) {
      setErrorConcurrency(errorStatus) // reset

      return true
    }

    errorQuantity.value++

    // Check if there are more than 50 errors within the past hour
    if (errorQuantity.value >= 50) {
      setErrorConcurrency(errorStatus)

      const metaError = {
        reason: 'Concurrent error rate exceeded: 50 errors per hour',
        description:
          'Error triggered by exceeding 50 errors in the past hour, possibly due to system overload or recurring issues.',
        resolution: 'Check system load or request patterns to address potential causes.',
      }

      if ('meta' in e && typeof e.meta === 'object') {
        e.meta = { ...e.meta, ...metaError }
      } else {
        ;(e as Record<string, unknown>).meta = metaError
      }

      return false
    }
  } else setErrorConcurrency(errorStatus)

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
 * @param {Record<string, unknown>} [option.headers={}] - Optional additional headers to be included in the response. These headers
 *                                                 will be merged with the default `JSON_CONTENT_HEADER`.
 * @param {string} [option.contextId] - Optional request context id to be sent with the error.
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
 * @param {Object} option - The options object containing error details.
 * @param {string} [option.message] - The error message describing the issue.
 * @param {string} [option.code] - A unique code representing the error.
 * @param {string} [option.meta] - Optional metadata related to the error (e.g., stack trace or additional context).
 * @param {string} [option.contextId] - An optional identifier for the request context, useful for correlating errors with specific requests.
 */
export const logAppError = (
  e: unknown,
  options: { message: string; code: string; meta?: Record<string, unknown>; contextId?: string },
) => {
  if (shouldNotLogError(e)) return

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
