import type { GqlOptions } from 'typings/clients.ts'
import { RestClient } from './rest.ts'

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
   * @returns {Promise<{ data: T }>} - A promise resolving to the parsed GraphQL response data.
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
    options: { variables?: Record<string, unknown>; request?: GqlOptions } = {},
  ): Promise<{ data: T }> {
    const { request, variables } = options
    return this.http.post<{ data: T }>('', {
      ...request,
      body: JSON.stringify({ query, variables }),
    })
  }
}
