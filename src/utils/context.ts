import type { HandlerContext, ScopedContext } from 'typings/context.ts'
import { generateUUID } from '@zanix/helpers'

/**
 * A function to process scoped context payload
 * @param payload
 * @returns
 */
export const processScopedPayload = (
  payload: HandlerContext['payload'],
): ScopedContext['payload'] => {
  return {
    params: (key) => payload.params[key],
    search: (key) => payload.search[key],
    body: (key) => payload.body[key],
  }
}

/**
 * A function to define processed payload accesor.
 *
 * Route MATCHING always runs against the LOWERCASED, cleaned request path (`match` is the regex
 * result against that lowercased string) — case-insensitive matching is unaffected by anything
 * below. Every param's VALUE, however, is recovered case-preserved: for each `params[i]`, this
 * slices the SAME capture group's own `[start, end]` offsets (`match.indices?.[i + 1]`, available
 * because `pathToRegex` always compiles with the `'d'` flag) out of `rawPath` — the identical
 * request path, computed by `getRawPath()`, cleaned the same way but never lowercased. This never
 * re-runs the regex; `cleanRoute`'s lowercased and case-preserved outputs are structurally
 * identical strings (same length, same segment boundaries — only letter casing differs), so the
 * offsets found against the lowercased match apply unchanged to `rawPath`. The same mechanism
 * covers both an ordinary `:param` and a trailing catch-all (`:name*`) uniformly — neither needs
 * any special-casing here.
 *
 * `getRawPath` is a THUNK, not a pre-computed string, invoked only here, inside this already-lazy
 * getter (itself evaluated only on the first real read of `ctx.payload.params`, then cached in
 * `_computedParams` — the same "compute once, only when accessed" contract `search`'s own
 * accessor has). `getMainHandler` builds this accessor for every matched route that declares at
 * least one param, so deferring the case-preserved path string to a thunk (rather than computing
 * it eagerly) means a route's `cleanRoute()`-shaped work only ever runs for a request whose
 * handler actually reads `params`. Falls back to `match`'s own lowercased capture whenever
 * `getRawPath` isn't given at all.
 *
 * @param match
 * @param params
 * @param getRawPath Lazily computes the SAME full path (`cleanRoute(pathname, true) + '/' +
 * method`) the request actually sent, case-preserved — called at most once, only on the first
 * actual read of `params`, and only when given. Omit entirely for a route with no params.
 * @returns
 */
export const payloadAccessorDefinition: (
  match: RegExpExecArray,
  params: string[],
  getRawPath?: () => string,
  // deno-lint-ignore no-explicit-any
) => PropertyDescriptor & ThisType<any> = (
  match,
  params,
  getRawPath,
) => ({
  set(value) {
    this._computedParams = value
  },
  get() {
    if (this._computedParams) return this._computedParams

    const matchParts = match.slice(1)
    this._computedParams = {}
    // Computed at most once, right here — never before this getter is actually invoked, and never
    // more than once even across multiple params (see this function's own doc).
    const rawPath = getRawPath?.()

    for (let i = 0; i < params.length; i++) {
      const name = params[i]
      // `match.indices[0]` is the whole match's own range — per-group ranges start at index 1,
      // same +1 offset `matchParts` (== `match.slice(1)`) already applies for the same reason.
      const rawRange = rawPath !== undefined ? match.indices?.[i + 1] : undefined
      if (rawRange && rawPath !== undefined) {
        // `+ 1` drops the capture group's own leading `/` — same adjustment `.slice(1)` already
        // makes below for every other param, kept consistent here.
        this._computedParams[name] = rawPath.slice(rawRange[0] + 1, rawRange[1])
        continue
      }
      this._computedParams[name] = matchParts[i]?.slice(1)
    }

    return this._computedParams
  },
})

/**
 * Context Id generator
 * @returns
 */
export const contextId = () => {
  return generateUUID()
}
