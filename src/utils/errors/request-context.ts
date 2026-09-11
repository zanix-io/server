const REQUEST_PROPERTY = 'request'
const HEADERS_PROPERTY = 'headers'

/**
 * Attaches `request` to `error` as a **non-enumerable** own property — retrievable later via
 * {@link getRequestFromError}, but invisible to anything that only sees an error's *enumerable*
 * shape: object spread (`{...error}`, exactly what `serializeError` does before an error reaches
 * the logger), `Object.keys`/`Object.entries`, `JSON.stringify`, and Deno's own
 * `console.error`/`Deno.inspect` formatting of a thrown `Error` instance — verified directly, not
 * assumed: a `Request` embedded as a plain enumerable field (e.g. inside `HttpError`'s own `meta`)
 * DOES get its headers printed in full by `console.error`, `Authorization`/`Cookie` included, since
 * Deno's inspector reads an object's own getters for display, unlike `JSON.stringify`. A
 * non-enumerable property sidesteps that entirely, at both layers — confirmed empirically that
 * `getPublicErrorResponse`/`httpErrorResponse` (this package's own real client-facing paths) and
 * `logAppError` (its backend-logging path) never surface it, only the deliberate
 * {@link getRequestFromError} call does.
 *
 * **This is obscurity, not a hard access boundary — know the limits.** Non-enumerable only hides
 * the property from APIs that specifically respect enumerability. `Object.getOwnPropertyNames`/
 * `Reflect.ownKeys` still list `"request"` as a real own key (verified directly), and
 * `error.request` reads it back with no need to go through {@link getRequestFromError} at all —
 * anyone who knows the property exists can reach it directly. This is exactly why attaching it is
 * gated behind `ServerOptions['attachRequestToErrors']`, defaulting to `false`, rather than treating
 * non-enumerability alone as sufficient protection: some downstream code (an observability/error-
 * reporting SDK doing a deep, `showHidden`-style dump of an error's *every* own property, for
 * instance) walks past enumerability entirely, and the only real defense against that is never
 * attaching the request in the first place unless a consumer has deliberately opted in.
 *
 * Used by `getMainHandler`'s own `NOT_FOUND`/`METHOD_NOT_ALLOWED` throws, and by `mainProcess`'s
 * `routerGuard`/`routerPipe` phase (CORS's own `BAD_REQUEST`/`METHOD_NOT_ALLOWED`, cookies, and any
 * custom `guard`/`pipe` throw — every error that reaches `onError` uncaught, uniformly) so a
 * downstream `onError` handler (see `ServerOptions['onError']`) can make a content-negotiation
 * decision — e.g. rendering a different shape of "not found" response based on a request header —
 * without `@zanix/server` itself needing to know what that header means.
 *
 * @param error - The error instance to attach `request` to. Mutated in place and returned.
 * @param request - The request being handled when `error` was thrown.
 */
export function attachRequestToError<E extends Error>(
  error: E,
  request: Request,
): E {
  Object.defineProperty(error, REQUEST_PROPERTY, {
    value: request,
    enumerable: false,
    configurable: true,
  })
  return error
}

/**
 * Reads back the `Request` {@link attachRequestToError} attached to `error`, if any — `undefined`
 * for any error that never went through it (including a plain `Error` a guard/interceptor throws
 * itself, which never gets this treatment automatically, and always when
 * `ServerOptions['attachRequestToErrors']` is left at its `false` default).
 *
 * A typed, safe convenience — not the only way to reach the value (see {@link attachRequestToError}'s
 * own doc on why non-enumerable isn't a hard boundary): the same underlying property is a real own
 * key, just not an enumerable one. This exists so a consumer never has to know the exact property
 * name or guard against it being an unrelated non-`Request` value themselves.
 *
 * @param error - Anything caught from a handler — typically an `onError` callback's own `error`
 * parameter (see `ServerOptions['onError']`).
 */
export function getRequestFromError(error: unknown): Request | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const request = (error as Record<string, unknown>)[REQUEST_PROPERTY]
  return request instanceof Request ? request : undefined
}

/**
 * Attaches `headers` to `error` as a **non-enumerable** own property — same mechanism, and same
 * "obscurity, not a hard access boundary" caveat, as {@link attachRequestToError}, applied to a
 * different, ALWAYS-ON need: `mainInterceptor` (`main.middlewares.ts`) only ever merges the guard
 * chain's own accumulated headers (most concretely `corsGuard`'s own `Access-Control-Allow-Origin`/
 * `-Allow-Methods`/`-Allow-Headers`/`Vary`) onto a response the HANDLER successfully returns.
 * `mainGuard`'s own guard loop and `mainProcess`'s own `routerPipe` phase (`webserver/helpers/
 * handler.ts`) are the two places a guard/pipe THROW (rather than returning `{ response }`) can
 * still escape past that merge entirely, uncaught, all the way to `Deno.serve`'s own `onError` —
 * see `onErrorListener`'s own doc for why that's the one guaranteed terminal `Response`-building
 * site for such an error. Without this, that response carries NO CORS headers at all: a real
 * cross-origin browser reports a CORS failure (`No 'Access-Control-Allow-Origin' header is
 * present`) and never surfaces the real denial/status underneath — the exact same masking
 * `mainGuard`'s own `{ response }`-denial merge (see that function's own doc) already fixes for a
 * guard that returns instead of throwing.
 *
 * Unlike {@link attachRequestToError}, this is unconditional — never gated behind
 * `ServerOptions['attachRequestToErrors']`. That flag exists because a raw `Request` can carry
 * sensitive headers (`Authorization`/`Cookie`) a consumer must opt into exposing; the headers
 * attached here are the OPPOSITE case — outbound RESPONSE headers a real browser needs to even see
 * the error at all, with no equivalent sensitivity to gate behind an opt-in.
 *
 * @param error - The error instance to attach `headers` to. Mutated in place and returned.
 * @param headers - The guard chain's own accumulated headers at the point `error` was thrown —
 * never re-attached over an already-stamped value (see call sites' own "only if not already
 * stamped" checks), so the MORE COMPLETE set (a `routerPipe` throw sees every guard's own headers;
 * a guard throw only sees the guards that ran before it) is never clobbered by a less complete one.
 */
export function attachHeadersToError<E extends Error>(
  error: E,
  headers: Headers,
): E {
  Object.defineProperty(error, HEADERS_PROPERTY, {
    value: headers,
    enumerable: false,
    configurable: true,
  })
  return error
}

/**
 * Reads back the {@link Headers} {@link attachHeadersToError} attached to `error`, if any —
 * `undefined` for any error that never went through it (including a plain handler-thrown error,
 * which `mainInterceptor` already merges headers onto directly and never needs this for — see
 * `attachHeadersToError`'s own doc for exactly which two phases DO need it).
 *
 * A typed, safe convenience — not the only way to reach the value (see {@link attachHeadersToError}'s
 * own doc). Primarily read by `onErrorListener`'s own terminal `httpErrorResponse` fallback; also
 * usable from a consumer's own custom `ServerOptions['onError']` callback that wants the same
 * headers merged onto ITS OWN response — mirrors the same voluntary-adoption model
 * {@link getRequestFromError} already establishes for the request itself.
 *
 * @param error - Anything caught from a handler — typically an `onError` callback's own `error`
 * parameter (see `ServerOptions['onError']`).
 */
export function getHeadersFromError(error: unknown): Headers | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const headers = (error as Record<string, unknown>)[HEADERS_PROPERTY]
  return headers instanceof Headers ? headers : undefined
}
