import type { RequestOptions, RestFullOptions } from 'typings/clients.ts'
import type { HttpMethod } from 'typings/router.ts'

import { HttpError } from '@zanix/errors'
import { ZanixConnector } from '../base.ts'
import { AUTH_HEADERS, JSON_CONTENT_HEADER } from 'utils/constants.ts'
import { cleanRoute } from '@zanix/helpers'

interface EtagCacheEntry {
  etag: string
  value: unknown
}

/**
 * Conditional-request (`ETag`) cache for every `RestClient` instance in this process, keyed by the
 * final resolved request URL **plus** a fingerprint of any identity/credential header present (see
 * `IDENTITY_HEADERS`, computed by {@link identityKey}) — a shared, HTTP-cache-shaped scope (by URL,
 * not by which client instance made the call) rather than a per-instance one, since a `RestClient`
 * subclass is often constructed fresh per call (e.g. per request/scope) while the remote resource
 * it points at stays the same.
 *
 * The identity fingerprint matters: without it, two callers hitting the identical URL under
 * different credentials (e.g. a multi-tenant endpoint routed by header, or two differently-scoped
 * instances of the same adapter) could have the SECOND caller's `If-None-Match` compared against
 * the FIRST caller's cached `ETag` — and, if the server's own `ETag` generation doesn't already
 * vary by identity either, get served the first caller's cached body via a spurious `304`. Keying
 * on identity too means a credential change always misses the cache instead of ever risking that.
 *
 * Only populated for `GET` requests whose response includes an `ETag` header — see `#http()`.
 */
const etagCache = new Map<string, EtagCacheEntry>()

/** Clears the module-level `ETag` cache — test-only. */
export function resetRestClientEtagCache(): void {
  etagCache.clear()
}

/** Builds the `ETag` cache key's identity suffix from any `identityHeaders` present. */
function identityKey(headers: HeadersInit | undefined, identityHeaders: string[]): string {
  const resolved = new Headers(headers)
  return identityHeaders.map((name) => resolved.get(name) ?? '').join('\0')
}

/**
 * Abstract base class for RESTful HTTP clients.
 *
 * Extends {@link ZanixConnector} to provide a structured HTTP client
 * with convenient methods for REST operations (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
 *
 * Each HTTP method automatically handles:
 * - Base URL resolution
 * - JSON request/response parsing
 * - Default headers (including `Content-Type: application/json`)
 * - Error handling with standardized {@link HttpError}
 * - Conditional `GET` caching: a response's `ETag` header (if any) is remembered and sent back as
 *   `If-None-Match` on the next `GET` to that same URL; a `304` response then reuses the
 *   previously cached value instead of a fresh body. Opt out per client or per call via the
 *   `etag: false` option — see {@link RequestOptions.etag}.
 *
 * @abstract
 * @extends ZanixConnector
 *
 * @example
 * class MyApiClient extends RestClient {
 *   constructor(options) {
 *     super(options);
 *   }
 *
 *   async getUser(id: string) {
 *     return this.http.get(`/users/${id}`);
 *   }
 * }
 *
 * const client = new MyApiClient({ baseUrl: 'https://api.example.com' });
 * const user = await client.getUser('123');
 */
export class RestClient extends ZanixConnector {
  #options
  /**
   * Headers included in the ETag cache key identity.
   * Override in subclasses to add identity-specific headers.
   */
  protected etagIdentityHeaders: string[] = [
    AUTH_HEADERS.user.toLowerCase(),
    AUTH_HEADERS.api.toLowerCase(),
  ]

  /** Convenience methods (`get`, `post`, `put`, `patch`, `delete`) for issuing REST requests. */
  public http: Record<
    Exclude<Lowercase<HttpMethod>, 'options' | 'head'>,
    <T>(endpoint: string, options?: RestFullOptions) => Promise<T>
  >

  /** Creates the REST client, merging the given options with the default JSON content headers. */
  constructor({ contextId, autoInitialize, ...options }: RequestOptions = {}) {
    super({ contextId, autoInitialize })
    this.#options = {
      ...options,
      headers: { ...JSON_CONTENT_HEADER, ...options.headers },
    }

    this.http = {
      put: this.#put.bind(this),
      post: this.#post.bind(this),
      delete: this.#delete.bind(this),
      get: this.#get.bind(this),
      patch: this.#patch.bind(this),
    }
  }

  /**
   * Determines whether a request should participate in conditional `ETag` caching.
   * Override in subclasses to customize ETag behavior.
   */
  protected shouldUseEtag(
    method: string,
    options: RestFullOptions,
  ): boolean {
    return method === 'GET' && options.etag !== false
  }

  #post = <T>(endpoint: string, options?: RestFullOptions) =>
    this.#http<T>('POST', endpoint, options)

  #get = <T>(endpoint: string, options?: RestFullOptions) => this.#http<T>('GET', endpoint, options)

  #put = <T>(endpoint: string, options?: RestFullOptions) => this.#http<T>('PUT', endpoint, options)

  #delete = <T>(endpoint: string, options?: RestFullOptions) =>
    this.#http<T>('DELETE', endpoint, options)

  #patch = <T>(endpoint: string, options?: RestFullOptions) =>
    this.#http<T>('PATCH', endpoint, options)

  #http = async <T = unknown>(
    method: string,
    endpoint: string,
    options?: RestFullOptions,
  ): Promise<T> => {
    options = {
      ...this.#options,
      ...options,
      headers: { ...this.#options.headers, ...options?.headers },
    }

    const baseUrl = options.baseUrl
    delete options.baseUrl

    const useEtag = this.shouldUseEtag(method, options)

    delete options.etag

    const [protocol, restOfUrl] = (baseUrl ? `${baseUrl}/${endpoint}` : endpoint).split('://')
    const url = `${protocol}:/${cleanRoute(restOfUrl, true)}`
    const cacheKey = `${url} ${identityKey(options.headers, this.etagIdentityHeaders)}`

    const cached = useEtag ? etagCache.get(cacheKey) : undefined
    if (cached) {
      options.headers = { ...options.headers, 'If-None-Match': cached.etag }
    }

    try {
      const response = await fetch(url, { method, ...options })

      // A `304` only ever comes back for a request THIS client conditioned on `If-None-Match`
      // (i.e. `cached` is set) — the cached value from that same ETag is still current.
      if (response.status === 304 && cached) {
        return cached.value as T
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`[HTTP ${response.status}] ${response.statusText}\n${text}`)
      }

      const value = response.headers.get('Content-Type')?.includes(
          JSON_CONTENT_HEADER['Content-Type'],
        )
        ? await response.json()
        : await response.text()

      const etag = response.headers.get('ETag')
      if (useEtag && etag) etagCache.set(cacheKey, { etag, value })

      return value as T
    } catch (e) {
      const error = e as HttpError
      throw new HttpError('BAD_REQUEST', {
        cause: error,
        message: 'Rest Client Http Error',
        meta: { source: 'zanix', url, status: error.code },
      })
    }
  }

  /** No-op: a REST client has no persistent connection to establish. */
  protected override initialize(): void {}
  /** No-op: a REST client has no persistent connection to tear down. */
  protected override close() {}
  /** Always `true`: a REST client has no connection state to check. */
  public override isHealthy(): boolean {
    return true
  }
}
