import type { MiddlewareGuard, MiddlewareInterceptor } from 'typings/middlewares.ts'

import { HttpError } from '@zanix/errors'

import { DEFAULT_PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER } from 'utils/constants.ts'
import { httpErrorResponse } from 'utils/errors/helper.ts'

/**
 * The `ctx.locals` key {@link createProtocolVersionGuard}'s guard stashes the resolved protocol
 * version under, so the matching {@link createProtocolVersionInterceptor} interceptor can stamp
 * the response with whatever was actually negotiated instead of a hardcoded constant.
 */
export const PROTOCOL_VERSION_LOCALS_KEY = 'protocolVersion'

/** Options accepted by the `versionProtocol` option on `@Controller`/`@Resolver`/`@Socket`. */
export type VersionProtocolOptions = {
  /** Header carrying the negotiated version. Defaults to {@link PROTOCOL_VERSION_HEADER}. */
  header?: string
  /**
   * This handler's current protocol version, stamped on every response. Defaults to
   * {@link DEFAULT_PROTOCOL_VERSION}.
   */
  version?: number
  /**
   * Every version this handler's guard still accepts on an incoming request's declared version
   * (oldest-first). Defaults to `[version]`.
   */
  supportedVersions?: readonly number[]
}

/** {@link VersionProtocolOptions} once every field has been resolved to a concrete value. */
export type ResolvedVersionProtocolOptions = Required<VersionProtocolOptions>

/**
 * The full shape of the `versionProtocol` option itself, as accepted by `@Controller`/`@Resolver`/
 * `@Socket`: `true`/omitted enables it with defaults, an object overrides specific fields, `false`
 * disables it. The single source of truth for that shape — reused by `HandlerDecoratorOptions`/
 * `SocketDecoratorOptions` (`typings/decorators.ts`) and each handler's public overload, instead of
 * every one of them repeating `boolean | VersionProtocolOptions`.
 */
export type VersionProtocolOption = boolean | VersionProtocolOptions

/**
 * Resolves the `versionProtocol` option accepted by `@Controller`/`@Resolver`/`@Socket` into a
 * fully-defaulted config, or `undefined` when the feature is disabled (`versionProtocol: false`).
 * `true` and `undefined` both resolve to the full defaults — the feature is on by default.
 */
export function resolveVersionProtocolOptions(
  input: VersionProtocolOption | undefined,
): ResolvedVersionProtocolOptions | undefined {
  if (input === false) return undefined

  const options = input === true || input === undefined ? {} : input
  const version = options.version ?? DEFAULT_PROTOCOL_VERSION

  return {
    header: options.header ?? PROTOCOL_VERSION_HEADER,
    version,
    supportedVersions: options.supportedVersions ?? [version],
  }
}

/**
 * Request-side half of protocol-version negotiation, generic over any `header`/`version`/
 * `supportedVersions` a consumer configures via `versionProtocol`. Reads the caller's declared
 * version, if sent — absent today by any caller that hasn't adopted this yet, so this defaults to
 * `options.version` and never breaks an existing caller. Rejects only an explicit, unrecognized
 * declared version (one not in `options.supportedVersions`) — never silently coerces one to a
 * version it didn't actually declare, since that risks misinterpreting a request shaped for a
 * genuinely incompatible version and would make the response header lie about what was actually
 * negotiated.
 *
 * The resolved version is stashed on `ctx.locals[PROTOCOL_VERSION_LOCALS_KEY]` for the matching
 * {@link createProtocolVersionInterceptor} interceptor to stamp back onto the response.
 */
export function createProtocolVersionGuard(
  options: ResolvedVersionProtocolOptions,
): MiddlewareGuard {
  return (ctx) => {
    const declared = ctx.req.headers.get(options.header)
    const version = declared === null ? options.version : Number(declared)

    if (!options.supportedVersions.includes(version)) {
      // `meta` here is exactly the case `exposeMeta` exists for: `declared`/`supported` are
      // directly actionable for whoever called with a version this handler doesn't accept, not
      // internal-only diagnostic detail — see `@zanix/errors`' `ErrorOptions.exposeMeta` doc.
      // Set via `Object.assign` after construction, not as a constructor option: the published
      // `@zanix/errors` this file currently resolves against may still lag behind the local,
      // not-yet-published `exposeMeta` field, in which case the constructor itself wouldn't apply
      // it — `getPublicErrorResponse` only ever reads the property off the instance, so this reaches
      // the same result either way. Simplify back to a plain constructor option once the version
      // pin catches up.
      const error = Object.assign(
        new HttpError('BAD_REQUEST', {
          message: `Unsupported ${options.header} version.`,
          meta: {
            source: 'zanix',
            method: 'protocolVersionGuard',
            declared,
            supported: options.supportedVersions,
          },
        }),
        { exposeMeta: true },
      )

      return {
        response: httpErrorResponse(error, { contextId: ctx.id }),
      }
    }

    ctx.locals[PROTOCOL_VERSION_LOCALS_KEY] = version
    return {}
  }
}

/**
 * Stamps the response with `options.header`, set to whichever version the matching {@link
 * createProtocolVersionGuard} guard resolved for this request (`ctx.locals[PROTOCOL_VERSION_
 * LOCALS_KEY]`), falling back to `options.version` when no guard ran first — safe to use even if
 * a consumer somehow only wires the interceptor half.
 */
export function createProtocolVersionInterceptor(
  options: ResolvedVersionProtocolOptions,
): MiddlewareInterceptor {
  return (ctx, response) => {
    const version = (ctx.locals[PROTOCOL_VERSION_LOCALS_KEY] as number | undefined) ??
      options.version
    response.headers.set(options.header, String(version))
    return response
  }
}
