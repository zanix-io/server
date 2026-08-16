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
 * Every param reads from `match` (the regex result against the LOWERCASED, cleaned request path)
 * exactly as before — case-insensitive matching/values, unchanged. The single exception is
 * `catchAllParam` (a route's own trailing `:name*`, if it declares one — see
 * `ProcessedRouteDefinition.catchAllParam`'s own doc): its value is instead sliced directly out of
 * `rawPath` (the SAME request path, cleaned identically but never lowercased) using that capture
 * group's own `[start, end]` offsets from `match.indices` — available because `pathToRegex` always
 * compiles with the `'d'` flag. This never re-runs the regex; `cleanRoute`'s lowercased and
 * case-preserved outputs are structurally identical strings (same length, same segment
 * boundaries — only letter casing differs), so the SAME offsets already found against the
 * lowercased match apply unchanged to `rawPath`. `rawPath`/`catchAllParam` are only ever both given
 * together (or neither) — see `getMainHandler`'s own call site.
 *
 * @param match
 * @param params
 * @param catchAllParam The name of `params`'s own catch-all entry, if this route declares one.
 * @param rawPath The SAME full path (`cleanRoute(pathname, true) + '/' + method`) the request
 * actually sent, case-preserved — required only when `catchAllParam` is given.
 * @returns
 */
export const payloadAccessorDefinition: (
  match: RegExpExecArray,
  params: string[],
  catchAllParam?: string,
  rawPath?: string,
  // deno-lint-ignore no-explicit-any
) => PropertyDescriptor & ThisType<any> = (
  match,
  params,
  catchAllParam,
  rawPath,
) => ({
  set(value) {
    this._computedParams = value
  },
  get() {
    if (this._computedParams) return this._computedParams

    const matchParts = match.slice(1)
    this._computedParams = {}

    for (let i = 0; i < params.length; i++) {
      const name = params[i]
      // `match.indices[0]` is the whole match's own range — per-group ranges start at index 1,
      // same +1 offset `matchParts` (== `match.slice(1)`) already applies for the same reason.
      const rawRange = name === catchAllParam ? match.indices?.[i + 1] : undefined
      this._computedParams[name] = rawRange && rawPath !== undefined
        // `+ 1` drops the capture group's own leading `/` — same adjustment `.slice(1)` already
        // makes below for every other param, kept consistent here.
        ? rawPath.slice(rawRange[0] + 1, rawRange[1])
        : matchParts[i]?.slice(1)
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
