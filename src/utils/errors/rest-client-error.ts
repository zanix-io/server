/**
 * The error a {@link RestClient} throws, in a module of its own that depends only on
 * `@zanix/errors`. `@zanix/server`'s root entry also exports it, but that entry brings the whole
 * server with it (the worker provider and `@zanix/utils`'s `WorkerManager` included), which a bundle
 * built for a browser must not contain and a bundler fails on. Code that only needs to recognize
 * this error imports it from here (`@zanix/server/client-errors`); it is the same class either way.
 *
 * @module
 */

import { HttpError } from '@zanix/errors'

/**
 * Thrown by {@link RestClient} for any failed call — a non-2xx upstream response, or a genuine
 * transport-level failure (DNS, timeout, connection refused). `RestClient` itself has no domain
 * knowledge of whose fault a non-2xx response is — a consumer's own bad input, or a genuine fault
 * in whatever it called — so it always defaults to `'BAD_GATEWAY'` as the honest status (see
 * `#http()`'s own doc). The real upstream status, when one exists, survives structured in
 * `meta.upstreamStatus`/`meta.upstreamStatusText` and is readable directly off the error via
 * {@link RestClientError.realHttpStatus}, for whichever caller DOES have the context to
 * reclassify with it.
 *
 * @example
 * ```ts
 * try {
 *   await client.http.get('/users/1')
 * } catch (error) {
 *   if (error instanceof RestClientError && error.realHttpStatus === 404) {
 *     // the resource genuinely doesn't exist upstream — not "my dependency is down"
 *   }
 * }
 * ```
 */
export class RestClientError extends HttpError {
  /**
   * The real HTTP status code the upstream call actually received. `undefined` for a genuine
   * transport-level failure — no response came back at all, so there's no real status to report.
   */
  public get realHttpStatus(): number | undefined {
    const upstreamStatus = this.meta?.upstreamStatus
    return typeof upstreamStatus === 'number' ? upstreamStatus : undefined
  }

  /**
   * The upstream `Retry-After` response header, in seconds — set whenever the failed response
   * carried one (typically alongside a `429`, e.g. `rateLimitGuard`'s own real header). `undefined`
   * when the response had no such header, or a genuine transport-level failure with no response at
   * all. Lets a caller with UI context (a login page rendering a real countdown, not just a static
   * "try again later" message) compute an absolute retry instant (`Date.now() + retryAfterSeconds *
   * 1000`) without re-parsing a raw header itself.
   */
  public get retryAfterSeconds(): number | undefined {
    const value = this.meta?.retryAfterSeconds
    return typeof value === 'number' ? value : undefined
  }
}
