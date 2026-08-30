import type { GqlClientOptions, GqlOptions, ReloadDescriptor } from 'typings/clients.ts'
import { RestClient, RestClientError } from './rest.ts'

/**
 * The shape of a single error in a GraphQL response's `errors` array, per the GraphQL-over-HTTP
 * spec — deliberately hand-defined here rather than imported from `graphql-js`'s own
 * `GraphQLFormattedError`: this connector has zero dependency on the `graphql` npm package (unlike
 * `jsr:@zanix/server/graphql`'s server-side handler), and importing just this one type would be
 * enough to pull it into the root barrel that exports {@link GraphQLClient}.
 */
export interface GraphQLErrorLike {
  /** Human-readable description of the error. */
  message: string
  /** Source-document positions the error is attributed to, if the server reported any. */
  locations?: { line: number; column: number }[]
  /** Response-field path the error is attributed to, if the server reported one. */
  path?: (string | number)[]
  /** Server-defined extra error data (an error code, for instance), if the server sent any. */
  extensions?: Record<string, unknown>
}

// The standard GraphQL introspection query, per the GraphQL spec's `__schema` introspection
// system — the exact shape `graphql-js`'s own `buildClientSchema()` needs to reconstruct a real
// `GraphQLSchema` from a raw response (every type's `kind`/`name`/`description`/`fields`/
// `inputFields`/`interfaces`/`enumValues`/`possibleTypes`, plus `directives`, `queryType`,
// `mutationType`, `subscriptionType`). Hand-written here rather than imported from `graphql-js`'s
// own `getIntrospectionQuery()`, same reasoning as {@link GraphQLErrorLike}'s own doc: this
// connector has zero dependency on the `graphql` npm package. Fixed and spec-defined — it never
// changes per call, so there's nothing to parameterize.
const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name kind }
    mutationType { name kind }
    subscriptionType { name kind }
    types {
      ...FullType
    }
    directives {
      name
      description
      locations
      args {
        ...InputValue
      }
    }
  }
}

fragment FullType on __Type {
  kind
  name
  description
  fields(includeDeprecated: true) {
    name
    description
    args {
      ...InputValue
    }
    type {
      ...TypeRef
    }
    isDeprecated
    deprecationReason
  }
  inputFields {
    ...InputValue
  }
  interfaces {
    ...TypeRef
  }
  enumValues(includeDeprecated: true) {
    name
    description
    isDeprecated
    deprecationReason
  }
  possibleTypes {
    ...TypeRef
  }
}

fragment InputValue on __InputValue {
  name
  description
  type { ...TypeRef }
  defaultValue
}

fragment TypeRef on __Type {
  kind
  name
  ofType {
    name
    kind
    ofType {
      name
      kind
      ofType {
        name
        kind
        ofType {
          name
          kind
          ofType {
            name
            kind
            ofType {
              name
              kind
              ofType {
                name
                kind
                ofType {
                  name
                  kind
                  ofType {
                    name
                    kind
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`

/**
 * Abstract base class for GraphQL clients.
 *
 * Extends {@link RestClient} to provide a simple interface for sending
 * GraphQL queries using the `POST` method.
 *
 * Each request automatically handles:
 * - Base URL resolution (inherited from RestClient)
 * - JSON request/response parsing
 * - Default headers
 * - Error handling via {@link HttpError}
 *
 * @abstract
 * @extends RestClient
 *
 * @example
 * class MyGraphQLClient extends GraphQLClient {
 *   async getUser(id: string) {
 *     const query = `
 *       query ($id: ID!) {
 *         user(id: $id) {
 *           id
 *           name
 *         }
 *       }
 *     `;
 *     return this.query<{ user: { id: string; name: string } }>(query, { variables: { id } });
 *   }
 * }
 *
 * const client = new MyGraphQLClient({ baseUrl: 'https://api.example.com/graphql' });
 * const user = await client.getUser('123');
 */
export abstract class GraphQLClient extends RestClient {
  /**
   * Which schema this client's queries should be checked against at build time — read only by
   * `zanix space build`'s GraphQL check step (`@zanix/cli`); never consulted here, at runtime, by
   * `query()` or anything else in this class. Three forms:
   * - A plain `string` — the name of a local Application's schema (see `getSchema()`,
   *   `jsr:@zanix/server/graphql`) this client's queries are checked against (`getSchema()` called
   *   with that name). The common case for a client talking to its own local server in a
   *   `spacecraft` project (space frontend + server, same process).
   * - The string literal `'external'` — marks this client as talking to a schema outside this
   *   project's own composition, checked for syntax only, never attempted against any schema.
   * - `{ external: true }` — also marks this client as external, but additionally opts into
   *   checking its queries against the real external schema cached by `zanix generate
   *   graphql-schema` (`@zanix/cli`, via {@link GraphQLClient.introspect}). The object shape is
   *   itself the opt-in — there's no separate boolean alongside it to combine incorrectly with a
   *   local Application name.
   *
   * Omit it entirely to try the default Application (`getSchema()` called with no argument).
   * Deliberately not inferred from `baseUrl` — a `spacecraft`'s own space and server halves can
   * bind different ports, so "local vs. external" can't be read reliably off the URL alone.
   *
   * @example
   * class UsersClient extends GraphQLClient {
   *   constructor() {
   *     super({ baseUrl: 'http://localhost:8000/graphql', schemaApplication: 'main' })
   *   }
   * }
   *
   * @example
   * class ThirdPartyClient extends GraphQLClient {
   *   constructor() {
   *     super({
   *       baseUrl: 'https://api.example.com/graphql',
   *       schemaApplication: { external: true },
   *     })
   *   }
   * }
   */
  protected readonly schemaApplication?: string | 'external' | { external: true }

  /**
   * Creates the GraphQL client — same `string | options` duality {@link RestClient}'s own
   * constructor keeps for `ZanixConnectorClass<T>`/DI compatibility (see its own doc), with one
   * addition: {@link schemaApplication}, extracted here so it never reaches `RestClient`'s HTTP
   * option merging (it must never be sent as part of an actual request).
   */
  constructor(options: string | GqlClientOptions = {}) {
    if (typeof options === 'string') {
      super(options)
      return
    }

    const { schemaApplication, ...restOptions } = options
    super(restOptions)
    this.schemaApplication = schemaApplication
  }

  /**
   * Sends a GraphQL query or mutation to the configured endpoint.
   *
   * The method performs a `POST` request with a JSON body containing
   * both the `query` string and optional `variables`. Additional
   * HTTP request configuration (headers, signal, etc.) can be provided
   * through the `request` option.
   *
   * @template T - The expected type of the GraphQL response data.
   * @param {string} query - The GraphQL query or mutation string.
   * @param {object} [options] - Optional configuration for the request.
   * @param {Record<string, unknown>} [options.variables] - Variables to be passed into the GraphQL query.
   * @param {GqlOptions} [options.request] - Additional options merged into the underlying HTTP request (e.g. headers).
   * @param {boolean} [options.reload] - Set to `true` to get `reloadDescriptor` back alongside
   * `data` — see {@link ReloadDescriptor} and `RestClient.reloadableHeaders`'s own doc (the same
   * mechanism `RestClient.http.*` already has, inherited here through `this.http.post`).
   * @returns {Promise<{ data: T }>} - A promise resolving to the parsed GraphQL response data (plus
   * `reloadDescriptor` when `options.reload` is `true`).
   * @throws {GraphQLClientError} If the response is a `200 OK` but its body carries a GraphQL-level
   * `errors` array — see {@link GraphQLClientError}'s own doc.
   *
   * @example
   * const result = await client.query<{ user: { id: string } }>(`
   *   query ($id: ID!) {
   *     user(id: $id) {
   *       id
   *       name
   *     }
   *   }
   * `, { variables: { id: '123' } });
   */
  public query<T = Record<string, unknown>>(
    query: string,
    options: { variables?: Record<string, unknown>; request?: GqlOptions; reload: true },
  ): Promise<{ data: T; reloadDescriptor: ReloadDescriptor }>
  /** Same as above, without `reload: true` — today's plain, unwrapped `{ data: T }` return. */
  public query<T = Record<string, unknown>>(
    query: string,
    options?: { variables?: Record<string, unknown>; request?: GqlOptions; reload?: false },
  ): Promise<{ data: T }>
  public async query<T = Record<string, unknown>>(
    query: string,
    options: {
      variables?: Record<string, unknown>
      request?: GqlOptions
      reload?: boolean
    } = {},
  ): Promise<{ data: T; reloadDescriptor?: ReloadDescriptor }> {
    const { request, variables, reload } = options
    const body = JSON.stringify({ query, variables })

    if (reload) {
      const response = await this.http.post<{ data: T; errors?: GraphQLErrorLike[] }>('', {
        ...request,
        body,
        reload: true,
      })
      this.#assertNoGraphQLErrors(response.data.errors)
      return { data: response.data.data, reloadDescriptor: response.reloadDescriptor }
    }

    const response = await this.http.post<{ data: T; errors?: GraphQLErrorLike[] }>('', {
      ...request,
      body,
    })
    this.#assertNoGraphQLErrors(response.errors)
    return { data: response.data }
  }

  /**
   * Runs the standard GraphQL introspection query (see `INTROSPECTION_QUERY`, this module's own
   * hand-written copy of the GraphQL spec's `__schema` query) against this client's own
   * `baseUrl`/headers, through {@link query} — same mechanism, same error handling, as any other
   * query this client sends.
   *
   * Returns the raw JSON `data` the endpoint answers with (typically `{ __schema: {...} }`) —
   * never a `graphql-js` `GraphQLSchema`. This connector has zero dependency on the `graphql` npm
   * package (see `INTROSPECTION_QUERY`'s own doc); converting the raw result into a real
   * `GraphQLSchema` (via `graphql-js`'s `buildClientSchema()`) is the caller's job — in practice,
   * `@zanix/cli`'s own GraphQL schema-cache/check tooling, which already depends on `graphql-js`
   * for other reasons.
   *
   * Many production GraphQL APIs disable introspection entirely — a real, common outcome, not an
   * edge case. This method does nothing to soften that: a disabled-introspection response or any
   * other request failure propagates as whatever {@link query} itself throws
   * ({@link GraphQLClientError} for a GraphQL-level `errors` array, `RestClientError` for an
   * HTTP-level failure), unmodified. Reporting that failure clearly is the caller's
   * responsibility — always an explicit, opt-in command (`@zanix/cli`), never a build/dev-time
   * path that could silently swallow it.
   *
   * @returns {Promise<Record<string, unknown>>} The introspection response's raw `data`.
   * @throws {GraphQLClientError} If the response is a `200 OK` but its body carries a GraphQL-level
   * `errors` array (the common shape for a disabled-introspection response).
   * @throws {RestClientError} If the request itself fails at the HTTP level.
   *
   * @example
   * const raw = await client.introspect();
   * // Elsewhere, with graphql-js available:
   * // const schema = buildClientSchema(raw as IntrospectionQuery);
   */
  public async introspect(): Promise<Record<string, unknown>> {
    const { data } = await this.query<Record<string, unknown>>(INTROSPECTION_QUERY)
    return data
  }

  /**
   * A GraphQL endpoint can answer `200 OK` and still carry an `errors` array instead of (or
   * alongside) `data` — the real, well-known quirk that means `RestClient`'s own `!response.ok`
   * check (HTTP-status-based) never fires for this. Without this check, a caller trusting
   * `query()`'s own `{ data: T }` return type would silently receive an invalid/absent `data`.
   */
  #assertNoGraphQLErrors(errors: GraphQLErrorLike[] | undefined): void {
    if (!errors?.length) return

    throw new GraphQLClientError('BAD_GATEWAY', {
      cause: new Error(errors.map((e) => e.message).join('; ')),
      message: 'GraphQL Client Error',
      meta: { source: 'zanix', upstreamStatus: 200, errors },
    })
  }
}

/**
 * Thrown by {@link GraphQLClient.query} when the response is a `200 OK` but its body carries a
 * GraphQL-level `errors` array — see {@link GraphQLClient.query}'s own doc for why `RestClient`'s
 * ordinary HTTP-status-based error handling never catches this case. The real GraphQL errors
 * survive structured in `meta.errors` and are readable directly off the error via
 * {@link GraphQLClientError.graphqlErrors}.
 *
 * Extends {@link RestClientError} — still an `HttpError`, still integrates with the same
 * logging/serialization conventions every other Zanix error does — rather than a fresh,
 * unrelated class. `realHttpStatus` reports `200` here (the request DID succeed at the HTTP
 * level): a caller distinguishing a real failure should read
 * {@link GraphQLClientError.graphqlErrors}, not `realHttpStatus`.
 *
 * @example
 * ```ts
 * try {
 *   await client.query('{ user { id } }')
 * } catch (error) {
 *   if (error instanceof GraphQLClientError) {
 *     console.log(error.graphqlErrors[0].message)
 *   }
 * }
 * ```
 */
export class GraphQLClientError extends RestClientError {
  /** The GraphQL-level errors the response body carried, as-is. Empty if none were structured
   * into `meta.errors` (never expected in practice — this error is only ever thrown with them). */
  public get graphqlErrors(): GraphQLErrorLike[] {
    return (this.meta?.errors as GraphQLErrorLike[] | undefined) ?? []
  }
}
