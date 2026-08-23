import type { Runtime, ServerID, WebServerTypes } from 'typings/server.ts'

import { cleanRoute, encoder, generateUUID } from '@zanix/helpers'
import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import { InternalError } from '@zanix/errors'
import { getPrefix } from 'utils/routes.ts'

/** Allowed charset for an anchored server's `serverID` once it doubles as a URL path prefix. */
const SAFE_SERVER_ID = /^[a-z0-9_-]+$/

/** Options accepted by {@link compileRuntime}. */
export type RuntimeActivation = {
  /** The Application this Runtime serves — see `ApplicationContainer`. Defaults to the default Application (`'main'`). */
  application?: string
  /**
   * An explicit id for this server. When given, this server's own id doubles as an anchoring,
   * obscuring URL prefix instead of a plain `globalPrefix`-based one — there is no auto-generated
   * fallback for this behavior: a server is "anchored" **if and only if** this is set. Must match
   * `[a-z0-9_-]+` once normalized, or `compileRuntime` throws.
   *
   * **Independent of `application`** — an Application other than the default one (`'admin'`,
   * `'billing'`, `'metrics'`, ...) is not, by itself, hidden or obscured; it's just a different
   * named composition boundary (see `docs/applications.md`'s "Applications" section). Whether a given
   * Runtime gets the id-anchored, obscured-URL treatment is this field's own, explicit decision —
   * `@zanix/core`'s admin bootstrap and `@zanix/admin`'s own standalone server both set one for
   * their own admin Runtime (via `resolveApplicationServerId`, reading their own
   * `ADMIN_SERVER_ID`/`ADMIN_HUB_SERVER_ID` respectively), but that's a choice each makes for its
   * own activation, not something implied by composing under a non-default Application.
   */
  explicitId?: ServerID
  /**
   * A previous id to keep dispatching alongside `explicitId`, for a bounded manual rotation
   * window — see `resolvePreviousApplicationServerId`. Both prefixes reach the same routes
   * simultaneously while this is set, so callers still using the old address keep working until
   * they're updated to the new one. Only meaningful alongside `explicitId`;
   * `compileRuntime` throws if given without it (there is nothing to rotate *from*).
   *
   * **Not supported for `type: 'graphql'`** — `compileRuntime` throws if given for that type.
   * `defineSchema` (`handlers/graphql/schema.ts`) consumes its Query/Mutation accumulator the
   * moment a schema is built, so a second `getMainHandler` build for the same Application (what
   * a second, previous-prefix handler would require) would compile an empty stub schema instead of
   * the real one — a correctness issue, not a style preference, so this is rejected outright rather
   * than silently shipping a broken previous-prefix endpoint. Rotate `rest`/`socket` only.
   */
  previousId?: ServerID
  /** The already-resolved `globalPrefix` this activation's server was given. */
  globalPrefix?: string
}

/**
 * Resolves a Runtime-activation config (see `docs/applications.md`'s "Applications" section) into a
 * concrete `Runtime` — the one place this resolution actually happens. This runs entirely at
 * composition time, before `WebServerManager.create` is ever called: `create` only ever consumes
 * the `Runtime` this returns, never derives id-anchoring/dispatch behavior itself.
 * `bootstrapServers` calls this once per server type it activates; `create`'s own default (when no
 * `Runtime` is given at all) calls this the same way, with no arguments beyond `type`; a direct
 * `WebServerManager.create` caller that wants anchored behavior builds one explicitly the same way.
 *
 * @param type The server type this Runtime activates.
 * @param activation The Application/prefix/id inputs — see {@link RuntimeActivation}. Defaults to
 * `{}` (the default Application, unanchored, freshly generated id).
 * @returns The compiled `Runtime`.
 * @throws {InternalError} If `activation.previousId` is given without `activation.explicitId`
 * (nothing to rotate from), if given for `type: 'graphql'` (unsupported — see
 * {@link RuntimeActivation.previousId}'s own doc), or if either id doesn't match `[a-z0-9_-]+`
 * once normalized — an id doubles as a URL path prefix, so an unsafe one would corrupt route
 * dispatch.
 */
export function compileRuntime(
  type: WebServerTypes,
  activation: RuntimeActivation = {},
): Runtime {
  const {
    application = DEFAULT_APPLICATION,
    explicitId,
    previousId,
    globalPrefix,
  } = activation

  if (previousId && !explicitId) {
    throw new InternalError(
      '"previousId" was given without an explicit "id" to rotate from — set one alongside it, or ' +
        'drop "previousId" if this server doesn\'t need an anchored (id-prefixed) URL.',
      { meta: { source: 'zanix', type } },
    )
  }

  if (previousId && type === 'graphql') {
    throw new InternalError(
      '"previousId" (rotation) isn\'t supported for a graphql server — building a second handler ' +
        'for the previous prefix would compile an empty stub schema instead of the real one. ' +
        "Rotate this Application's rest/socket servers only.",
      { meta: { source: 'zanix', type } },
    )
  }

  const validateAnchoredId = (id: string): string => {
    const normalized = getPrefix(id)
    if (!SAFE_SERVER_ID.test(normalized)) {
      throw new InternalError(
        `Invalid anchored server id "${normalized}" — must match ${SAFE_SERVER_ID} (lowercase ` +
          'letters, digits, "_"/"-" only) since it doubles as a URL path prefix.',
        { meta: { source: 'zanix', serverID: normalized } },
      )
    }
    return normalized
  }

  // `serverID` always gets a value — explicit or a random default — since it also doubles as this
  // server's own bookkeeping key in `WebServerManager`'s internal state, regardless of whether it's
  // anchored. Only when `explicitId` was actually given does it ALSO double as the URL path prefix
  // routes are dispatched under (see `dispatchKey`/`routeHandlerPrefix` below) — unlike a public
  // `globalPrefix`, it never goes through `getPrefix`'s case/slash normalization otherwise, and
  // `pathToRegex` (utils/routes.ts) interpolates it unescaped for parameterized routes (e.g.
  // `/admin/triggers/:model`, already shipped), so a caller-supplied id is normalized/validated here.
  const serverID = explicitId
    ? validateAnchoredId(explicitId)
    : `${encoder.encode(type).toHex()}${generateUUID()}`

  const prefix = getPrefix(globalPrefix ?? '')
  // Multiplexer dispatch key (see `WebServerManager`'s `HandlerBox` per port) — must stay a single
  // path segment: the multiplexer's per-request lookup (`helpers/handler.ts`'s `multiplexer()`)
  // calls `getPrefix(url.pathname)`, which only ever extracts the first segment, to find the
  // handler for this port. When `explicitId` was given, that's `serverID` alone (never combined
  // with `globalPrefix` below — see `routeHandlerPrefix`), otherwise it's the same `prefix` already
  // used for everything else. This is what lets an anchored and an unanchored server of the *same*
  // `type` correctly share one port/listener.
  const dispatchKey = explicitId ? serverID : prefix

  // The route-path prefix `getMainHandler`/`routeProcessor` build this handler's own path table
  // from — a separate concern from `dispatchKey` above (that one is only for the multiplexer's
  // per-port lookup; this one is what every registered route's full path is actually matched
  // against). When anchored, a caller-supplied `globalPrefix` is folded in as an ADDITIONAL segment
  // after `serverID` (`{serverID}/{globalPrefix}/...`) rather than replacing it — `serverID`'s own
  // unguessable-by-choice property (the reason an anchored server uses an id-based prefix at all)
  // is preserved either way. Omitting `globalPrefix` (the common case) leaves this byte-for-byte
  // identical to `serverID` alone.
  const routeHandlerPrefix = explicitId
    ? (globalPrefix ? `${serverID}/${cleanRoute(globalPrefix).slice(1)}` : serverID)
    : prefix

  // `previousId`'s own dispatch key/prefix — same shape as the primary one above, resolved
  // independently so `WebServerManager.create` can register both as separate `HandlerBox` entries
  // sharing one port, giving callers still using the old address a bounded window to update.
  let previousDispatchKey: string | undefined
  let previousRouteHandlerPrefix: string | undefined
  if (previousId) {
    const previousServerID = validateAnchoredId(previousId)
    previousDispatchKey = previousServerID
    previousRouteHandlerPrefix = globalPrefix
      ? `${previousServerID}/${cleanRoute(globalPrefix).slice(1)}`
      : previousServerID
  }

  return {
    application,
    serverID,
    dispatchKey,
    routeHandlerPrefix,
    previousDispatchKey,
    previousRouteHandlerPrefix,
  }
}
