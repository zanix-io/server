import type { ConnectorOptions } from './targets.ts'

/**
 * Represents configuration options for a REST request,
 * based on {@link ConnectorOptions} interface and
 * the standard {@link RequestInit} interface,
 * but excluding the `method` and `body` properties-
 *
 * Use this type when you want to provide additional
 * fetch options without allowing the HTTP method or
 * request body to be overridden.
 *
 * @property {string} [baseUrl] - Optional base URL to prepend to request paths.
 */
export type RequestOptions =
  & Omit<RequestInit, 'method' | 'body'>
  & ConnectorOptions
  & {
    /**
     * Optional base URL to prepend to request paths.
     */
    baseUrl?: string
    /**
     * Whether `GET` requests participate in `RestClient`'s conditional-request (`ETag`/
     * `If-None-Match`) cache. Defaults to `true`. Set to `false` to opt this client out entirely —
     * e.g. for an endpoint that never sends `ETag`, or one where a `304` shouldn't ever short-circuit
     * a fresh read. Has no effect on non-`GET` methods, which never participate regardless.
     */
    etag?: boolean
    /**
     * A custom `Deno.HttpClient` every request from this `RestClient` instance is issued through —
     * e.g. one built via `Deno.createHttpClient({ cert, key })` to present a client certificate on
     * every call (mTLS). Passed straight through to `fetch()`'s own `client` option; not part of the
     * standard `RequestInit` shape `Omit<RequestInit, ...>` above already captures, so it's named
     * here explicitly.
     */
    client?: Deno.HttpClient
  }

/**
 * Represents configuration options for RESTful HTTP requests.
 *
 * This type is based on the standard {@link RequestInit} interface,
 * but excludes the `method` property so that it can be automatically
 * defined by higher-level REST helpers (e.g., `get`, `post`, `put`, `delete`).
 *
 * It also adds an optional `baseUrl` property that can be used
 * to define a common base URL for all requests.
 *
 * @property {string} [baseUrl] - Optional base URL to prepend to request paths.
 */
export type RestFullOptions = Omit<RequestInit, 'method'> & {
  baseUrl?: string
  /** Per-call override of the constructor's own `etag` option — see {@link RequestOptions.etag}. */
  etag?: boolean
  /** Set to `true` to get this call's `{ data, reloadDescriptor }` shape back — see
   * {@link ReloadDescriptor}. Defaults to `false` (today's plain return value, unchanged). */
  reload?: boolean
}

/**
 * Configuration options for a GraphQL HTTP request.
 *
 * This type extends the native {@link RequestInit} interface, omitting
 * the `method` and `body` fields, since these are automatically handled
 * by the GraphQL client (which always uses `POST` and generates the request body).
 *
 * It also introduces an optional `baseUrl` property that can be used
 * to specify a shared root endpoint for all GraphQL operations.
 *
 * @property {string} [baseUrl] - Optional base URL to prepend to request paths.
 */
export type GqlOptions = Omit<RequestInit, 'method' | 'body'> & {
  baseUrl?: string
}

/**
 * A ready-to-replay descriptor for a single `RestClient`/`GraphQLClient` call — attached as
 * `reloadDescriptor` when a call is made with `reload: true`. Deliberately captures everything a
 * plain `fetch()` needs (already fully resolved), so a caller replaying it — typically a Comet,
 * client-side, that received this via a page's own `loader` — never needs any REST/GraphQL-aware
 * logic of its own:
 *
 * ```ts
 * fetch(reload.endpoint, { method: reload.method, headers: reload.headers, body: reload.body })
 * ```
 *
 * `headers` is NEVER a blind copy of whatever headers the original call actually sent — see
 * `RestClient.reloadableHeaders`'s own doc for why (a credential-carrying header must never reach
 * this far — this whole descriptor gets serialized into the page's initial client-side state).
 */
export interface ReloadDescriptor {
  /** The fully resolved request URL (`baseUrl` + path already joined and cleaned). */
  endpoint: string
  /** The HTTP method the original call used. */
  method: string
  /** Only the headers `reloadableHeaders` allowlisted — never every header the call actually sent. */
  headers: Record<string, string>
  /** The exact body string the original call sent, if any (already `JSON.stringify`'d or
   * otherwise encoded) — omitted when the original call's body wasn't a plain string. */
  body?: string
}

/**
 * Configuration options for constructing a `GraphQLClient` — everything {@link RequestOptions}
 * already accepts (`baseUrl`, headers, `etag`, ...), plus a build-time-only hint about which
 * local schema this client's queries belong to.
 *
 * @property {string | 'external' | { external: true }} [schemaApplication] - Which schema this
 * client's queries should be checked against at build time by `zanix space build`'s GraphQL check
 * step (`@zanix/cli`) — never read at runtime, by `query()`/`http.*` or anything else in this
 * class. Three forms:
 * - A plain `string` — the name of a local Application's schema (see `getSchema()`,
 *   `jsr:@zanix/server/graphql`) this client's queries are checked against.
 * - The string literal `'external'` — marks this client as talking to a schema outside this
 *   project's own composition, checked for syntax only (no schema to check against).
 * - `{ external: true }` — also marks this client as external, but additionally opts into
 *   checking its queries against the real external schema cached by `zanix generate
 *   graphql-schema` (`@zanix/cli`, via `GraphQLClient.introspect()`). The object shape is itself
 *   the opt-in — there's no separate boolean to combine incorrectly with a local
 *   `schemaApplication` name (a previous, now-replaced design had exactly that problem: an
 *   orthogonal boolean silently doing nothing when set without `'external'`).
 *
 * Omit `schemaApplication` entirely to try the default Application. Deliberately not inferred
 * from `baseUrl` — a `spacecraft`'s own space and server halves can bind different ports, so
 * "local vs. external" can't be read reliably off the URL alone.
 */
export type GqlClientOptions = RequestOptions & {
  schemaApplication?: string | 'external' | { external: true }
}
