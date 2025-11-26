import type { MiddlewareGuard } from 'typings/middlewares.ts'

import { getCookies } from '@std/http'

/**
 * Middleware guard that parses the incoming request's cookies and exposes only
 * framework-scoped cookies—those whose names begin with the `"X-Znx-"` prefix.
 *
 * By stripping out user-level or third-party cookies, this guard ensures that
 * downstream middleware and handlers interact exclusively with application-relevant
 * cookies, reducing unintended coupling and improving security boundaries.
 *
 * @function cookiesGuard
 * @returns {MiddlewareGuard} A middleware guard that injects the filtered cookie
 *          set into the request context.
 */
export const cookiesGuard = (): MiddlewareGuard => {
  return (ctx) => {
    const raw = getCookies(ctx.req.headers) // Parsed cookies
    const filtered: Record<string, string> = {}

    for (const key of Object.keys(raw)) {
      if (key.startsWith('X-Znx-')) {
        filtered[key] = raw[key]
      }
    }

    ctx.cookies = filtered

    Object.freeze(ctx.cookies)

    return {}
  }
}
