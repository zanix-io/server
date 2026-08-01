import type {
  DiscoveryContract,
  DiscoveryHttpRuntime,
  DiscoveryProvider,
} from 'typings/discovery.ts'
import type { HandlerFunction } from 'typings/router.ts'
import type { MiddlewareGuard } from 'typings/middlewares.ts'

import { DISCOVERY_PROTOCOL_HEADER } from 'utils/constants.ts'
import {
  createProtocolVersionGuard,
  createProtocolVersionInterceptor,
} from 'modules/infra/middlewares/protocol-version.ts'

/**
 * Resolves a `DiscoveryContract` (plus whatever caller-supplied `guards` `defineDiscovery` was
 * given) into the HTTP-specific plan `bootstrapServers` needs — mirrors `compileRuntime`: pure, no
 * side effects. Never runs at `defineDiscovery()` time, only when `bootstrapServers()` actually
 * activates a REST server for the contract's Application — the same reason routes are only
 * compiled into a `Runtime` inside `bootstrapServers()`, never at `defineRoute()` time.
 *
 * The protocol-version guard/interceptor pair is appended here, not left to the caller — every
 * Discovery endpoint negotiates `DISCOVERY_PROTOCOL_HEADER` the same way, regardless of which
 * resource it serves or what auth guards were supplied alongside it.
 */
export function compileHttpRuntime(
  contract: DiscoveryContract,
  callerGuards: MiddlewareGuard[] = [],
): DiscoveryHttpRuntime {
  const versionOptions = {
    header: DISCOVERY_PROTOCOL_HEADER,
    version: contract.protocolVersion,
    supportedVersions: [contract.protocolVersion],
  }

  return {
    path: `.well-known/zanix/${contract.resourceType}`,
    guards: [...callerGuards, createProtocolVersionGuard(versionOptions)],
    interceptors: [createProtocolVersionInterceptor(versionOptions)],
  }
}

/**
 * Builds the actual request handler for a Discovery route — the only thing this produces is the
 * response body; auth/protocol-version negotiation already happened via `runtime.guards`/
 * `interceptors` (attached by `routeProcessor`'s own middleware pipeline, the same as any other
 * route — nothing Discovery-specific runs inside this function).
 *
 * `version()` is accepted by `DiscoveryProvider` but not yet used here to skip a redundant
 * `snapshot()` call — that caching optimization is specified (see `DiscoveryProvider.version`'s own
 * doc) but deliberately not built until a real provider needs it; every request calls `snapshot()`
 * fresh for now, which is correct, just not maximally efficient.
 */
export function buildDiscoveryHandler(
  contract: DiscoveryContract,
  provider: DiscoveryProvider<unknown>,
): HandlerFunction {
  return async () => {
    const items = await provider.snapshot()
    return {
      resourceType: contract.resourceType,
      generatedAt: new Date().toISOString(),
      items,
    }
  }
}
