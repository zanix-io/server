import type { HandlerContext } from 'typings/context.ts'
import type { CorsOptions, MiddlewareInternalGuard } from 'typings/middlewares.ts'
import type { WebServerTypes } from 'typings/server.ts'
import type { HttpMethod } from 'typings/router.ts'

import { HttpError } from '@zanix/errors'

/**
 * Creates a CORS (Cross-Origin Resource Sharing) validation middleware.
 *
 * This middleware inspects incoming requests and sets the appropriate
 * `Access-Control-*` headers according to the provided configuration.
 * It supports credentialed and non-credentialed CORS modes, customizable
 * preflight behavior, allowed methods, headers, and exposed headers.
 *
 * ---
 * ### 🔧 Defaults
 * - `credentials`: `true`
 * - `allowedHeaders`: `["Content-Type"]`
 * - `allowedMethods`: `["GET", "POST", "PUT", "DELETE"]`
 * - `exposedHeaders`: `["Content-Length", "X-Kuma-Revision"]`
 * - `preflight.maxAge`: _not set (browser default)_
 * - `preflight.optionsSuccessStatus`: _not set (default `204`)_
 *
 * ---
 * @template Credential - Boolean flag indicating whether the CORS policy allows credentials.
 *
 * @param {Object} options - Configuration object for CORS policy.
 *
 * @param {boolean} [options.credentials=true]
 *   Whether to include `Access-Control-Allow-Credentials: true`.
 *   - If `true`, requests may include cookies or authorization headers.
 *   - When enabled, the response must specify a **specific origin** instead of `"*"`.
 *   - If `false`, `Access-Control-Allow-Origin` may be `"*"`, and no credentials are sent.
 *
 * @param {string[]} [options.exposedHeaders=["Content-Length", "X-Kuma-Revision"]]
 *   Headers that browsers are allowed to access via `Access-Control-Expose-Headers`.
 *   Typically used to expose metadata like `Content-Length` or pagination info.
 *
 * @param {string[]} [options.allowedHeaders=["Content-Type"]]
 *   Headers that clients may send in cross-origin requests.
 *   Used for the `Access-Control-Allow-Headers` response header.
 *
 * @param {HttpMethod[]} [options.allowedMethods=["GET", "POST", "PUT", "DELETE"]]
 *   HTTP methods allowed for cross-origin requests.
 *   Used for the `Access-Control-Allow-Methods` header.
 *
 * @param {Object} [options.preflight]
 *   Configuration for handling CORS preflight (`OPTIONS`) requests.
 *
 * @param {600 | 3600 | 86400} [options.preflight.maxAge]
 *   Number of seconds to cache preflight responses (`Access-Control-Max-Age`).
 *   - `600` → 10 minutes
 *   - `3600` → 1 hour
 *   - `86400` → 24 hours
 *   If omitted, the browser decides its own cache duration.
 *
 * @param {200 | 204} [options.preflight.optionsSuccessStatus=204]
 *   HTTP status code used for successful preflight responses.
 *   - `204` (default) = “No Content” (recommended)
 *   - `200` = “OK”, useful for legacy clients
 *
 * @param {string[] | RegExp | ((origin: string) => boolean)} [options.origins]
 *   Allowed origins for credentialed requests.
 *   - Required when `credentials: true`.
 *   - Can be an array of exact origin strings, a regular expression, or a validation function.
 *   - If `credentials: false`, this option is ignored and `"*"` may be used instead.
 *
 * @param {WebServerTypes} type - Web server types to correct adaptation.
 *
 * @returns {(ctx: HandlerContext) => { response?: Response; headers?: Record<string, string> }} A middleware function
 * that must be used to configure CORS policy to the response.
 */
export const corsGuard = (
  options?: CorsOptions,
  type: WebServerTypes = 'rest',
): MiddlewareInternalGuard => {
  if (!options) return () => ({})

  const methodMap: Record<WebServerTypes, HttpMethod[]> = {
    graphql: ['GET', 'POST'],
    socket: ['GET'],
    ssr: ['GET'],
    rest: ['GET', 'POST', 'PUT', 'DELETE'],
  }

  const defaultAllowedMethods = methodMap[type]

  return (ctx: HandlerContext) => {
    const {
      origins = '*',
      preflight,
      credentials = true,
      allowedHeaders = ['Content-Type'],
      allowedMethods = defaultAllowedMethods,
      exposedHeaders = ['Content-Length', 'X-Kuma-Revision'],
    } = options as CorsOptions

    const requestOrigin = ctx.req.headers.get('Origin')

    if (requestOrigin) {
      const isValidOrigin = typeof origins === 'function'
        ? origins(requestOrigin)
        : origins === '*'
        ? true
        : origins.some((value) =>
          typeof value === 'string' ? value === requestOrigin : value.test(requestOrigin)
        )

      if (!isValidOrigin) {
        throw new HttpError('BAD_REQUEST', {
          message: `CORS blocked for origin: ${requestOrigin}`,
        })
      }
    }

    // Preflights
    if (ctx.req.method === 'OPTIONS' && preflight) {
      const response = new Response(undefined, {
        status: preflight.optionsSuccessStatus,
        headers: {
          'Access-Control-Max-Age': preflight.maxAge.toString(),
        },
      })
      return { response }
    }

    // Allowed methods validation
    if (!allowedMethods.includes(ctx.req.method as HttpMethod)) {
      throw new HttpError('METHOD_NOT_ALLOWED', { id: ctx.id })
    }

    // Websocket adaptation
    if (ctx.req.headers.get('Upgrade') === 'websocket') return {}

    // Valid origin headers
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': allowedMethods.join(', '),
      'Access-Control-Allow-Headers': allowedHeaders.join(', '),
      'Access-Control-Expose-Headers': exposedHeaders.join(', '),
    }
    if (requestOrigin) {
      headers['Access-Control-Allow-Origin'] = credentials ? requestOrigin : '*'
      if (credentials) {
        headers['Access-Control-Allow-Credentials'] = 'true'
      }
      headers['Vary'] = 'Origin'
    } else {
      headers['Access-Control-Allow-Origin'] = '*'
    }

    return { headers }
  }
}
