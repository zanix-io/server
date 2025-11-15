import { JSON_CONTENT_HEADER } from 'utils/constants.ts'
import { serializeError } from '@zanix/errors'

export const baseErrorResponses = (error: unknown) => {
  const serializedError = serializeError(error)
  delete serializedError.stack

  return JSON.stringify(serializedError)
}

/**
 * Generates an HTTP Response for an error with an appropriate status code and headers.
 *
 * This function processes an error, formats it using `baseErrorResponses`, and returns an HTTP response.
 * The response status is determined based on the `status` property in the error object. If no status is provided,
 * a default status code of 400 (Bad Request) is used.
 * Additionally, custom headers can be provided, which will be merged with the default headers.
 *
 * @param {unknown} error - The error object to be processed. The error should contain a `status` field with a `value`
 *                           that determines the response status code. If not, a 400 status is used.
 * @param {Record<string, unknown>} [headers={}] - Optional additional headers to be included in the response. These headers
 *                                                 will be merged with the default `JSON_CONTENT_HEADER`.
 *
 * @returns {Response} A Response object containing the formatted error message and status code.
 *
 * @example
 * const error = { status: { value: 404 }, message: "Not Found" };
 * const response = errorResponses(error);
 * console.log(response.status); // 404
 * console.log(response.headers.get("Content-Type")); // "application/json"
 */
export const errorResponses = (error: unknown, headers?: Record<string, unknown>): Response => {
  return new Response(baseErrorResponses(error), {
    headers: { ...JSON_CONTENT_HEADER, ...headers },
    status: error?.['status' as never]?.['value'] || 400,
  })
}
