import type { MiddlewareGuard } from 'typings/middlewares.ts'

import { getCookies } from '@std/http'

/**
 * Middleware guard that parses cookies from the incoming request and
 * exposes only user-level cookies, filtering out any internal framework
 * cookies whose names start with the prefix `"X-Znx-"`.
 *
 * This ensures that downstream middleware and handlers only see
 * application-relevant cookies, keeping framework internals hidden and
 * preventing accidental coupling.
 *
 * @function cookiesGuard
 * @returns {MiddlewareGuard} Middleware guard that injects filtered cookies into the request context.
 */
export const cookiesGuard = (): MiddlewareGuard => {
  return (ctx) => {
    const raw = getCookies(ctx.req.headers) // Parsed cookies
    const filtered: Record<string, string> = {}

    for (const key in raw) {
      // Exclude framework cookies as fast as possible
      if (key.startsWith('X-Znx-')) continue
      filtered[key] = raw[key]
    }

    ctx.cookies = filtered

    Object.freeze(ctx.cookies)

    return {}
  }
}
