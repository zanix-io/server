import type { GraphqlValidationOptions } from 'typings/server.ts'
import type { HandlerFunction } from 'typings/router.ts'

/**
 * The shape of {@linkcode getGraphqlHandler} (`handler.ts`) — a factory building one GraphQL
 * request handler for a given Application. Kept as a standalone type here (not
 * `typeof import('./handler.ts').getGraphqlHandler`) so this file never itself resolves
 * `handler.ts`'s real module graph, which reaches the actual `graphql` (`graphql-js`) npm package.
 */
export type GraphqlHandlerFactory = (
  application?: string,
  validationOptions?: GraphqlValidationOptions,
) => HandlerFunction

/**
 * The real GraphQL handler factory, once registered — `undefined` until something actually
 * resolves `handler.ts`'s module (see {@linkcode registerGraphqlHandlerFactory}'s own doc for when
 * that happens). A plain runtime slot, mutated only through the two functions below — never
 * exported directly.
 */
let graphqlHandlerFactory: GraphqlHandlerFactory | undefined

/**
 * Registers the real {@linkcode getGraphqlHandler} implementation into this module's slot.
 * `handler.ts` calls this once, unconditionally, as a top-level side effect of its own module
 * evaluating — which happens the moment anything reaches it, directly or transitively (every
 * `@zanix/server/graphql` decorator — `Resolver`/`Query`/`Mutation`/`Request` — already imports
 * `handler.ts` for `getRootValueBucket`/`RequestContext`, so decorating a single resolver is
 * enough). This indirection is what keeps `getMainHandler` (`webserver/helpers/handler.ts`, shared
 * by REST/Socket/SSR/GraphQL alike) from ever needing a static import of `handler.ts` itself —
 * only of this npm-`graphql`-free file — so a REST/Socket/SSR-only consumer never resolves the real
 * `graphql` package merely by depending on `@zanix/server`'s shared dispatch machinery.
 *
 * A plain, re-callable function rather than a decorator or a cached import — the same shape every
 * other registration entrypoint in this codebase already uses for a registry a finalized boot can
 * wipe and later repopulate.
 */
export function registerGraphqlHandlerFactory(factory: GraphqlHandlerFactory): void {
  graphqlHandlerFactory = factory
}

/**
 * Returns the registered {@linkcode GraphqlHandlerFactory}, or `undefined` if nothing has
 * registered one yet — see {@linkcode registerGraphqlHandlerFactory}'s own doc for when that
 * registration actually happens.
 */
export function getGraphqlHandlerFactory(): GraphqlHandlerFactory | undefined {
  return graphqlHandlerFactory
}
