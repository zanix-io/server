import type { ReloadMetadata, RequestOptions, RestFullOptions } from 'typings/clients.ts'
import type { HttpMethod } from 'typings/router.ts'

import { HttpError } from '@zanix/errors'
import { ZanixConnector } from '../base.ts'
import { AUTH_HEADERS, JSON_CONTENT_HEADER } from 'utils/constants.ts'
import { cleanRoute } from '@zanix/helpers'
import { getConnectors } from '../../../program/public.ts'
import type { ZanixCacheConnector } from './cache.ts'

interface EtagCacheEntry {
  etag: string
  value: unknown
}

/** Whatever actually stores `ETag` entries for a given call — either the resolved `'cache:local'`
 * core connector or the module-level `Map` fallback; both already have this exact shape. */
interface EtagCacheStore {
  get(key: string): EtagCacheEntry | undefined
  set(key: string, value: EtagCacheEntry): void
}

/**
 * Fallback conditional-request (`ETag`) cache, used only when the `'cache:local'` core connector
 * slot isn't registered (see {@link RestClient}'s own `#resolveEtagCache`) — keyed by the
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
function identityKey(
  headers: HeadersInit | undefined,
  identityHeaders: string[],
): string {
  const resolved = new Headers(headers)
  return identityHeaders.map((name) => resolved.get(name) ?? '').join('\0')
}

/**
 * A call's own two-shape return, based on `metadata` — `true` gets `{ data, reloadMetadata }`
 * (see {@link ReloadMetadata}), anything else (the default) keeps today's plain return value.
 * Shared by every `RestClient.http.*` method except `head` (which already returns a `Response`).
 */
export interface RestMethodWithMetadata {
  <T>(endpoint: string, options: RestFullOptions & { metadata: true }): Promise<
    { data: T; reloadMetadata: ReloadMetadata }
  >
  <T>(endpoint: string, options?: RestFullOptions & { metadata?: false }): Promise<T>
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
 *   `etag: false` option — see {@link RequestOptions.etag}. Stored via the `'cache:local'` core
 *   connector slot when a package that owns it (e.g. `@zanix/datamaster`) is registered, or an
 *   in-process `Map` otherwise — either way, this is transparent, nothing to configure.
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
  #httpOptions
  /**
   * Headers included in the ETag cache key identity.
   * Override in subclasses to add identity-specific headers.
   */
  protected etagIdentityHeaders: string[] = [
    AUTH_HEADERS.user.toLowerCase(),
    AUTH_HEADERS.api.toLowerCase(),
  ]

  /**
   * Header names safe to copy into a call's `reloadMetadata.headers` when it's made with
   * `metadata: true` — never a blind copy of whatever headers the call actually sent. Some (an
   * `Authorization` bearer token, an internal API key) carry real credentials that must never
   * reach the browser: `reloadMetadata` is meant to be forwarded through a page's own `loader` as
   * serializable data and read back client-side (typically by a Comet re-issuing the same call),
   * so anything included here ends up in the page's initial client-side state, in plain text.
   *
   * Defaults to `['content-type']` — harmless, and generally useful for a replayed call to know.
   * Override in a subclass to allowlist more (e.g. a header carrying a genuinely public API key),
   * never to forward something secret.
   */
  protected reloadableHeaders: string[] = ['content-type']

  /** Convenience methods (`get`, `post`, `put`, `patch`, `delete`, `head`) for issuing REST requests. */
  public http:
    & Record<Exclude<Lowercase<HttpMethod>, 'head'>, RestMethodWithMetadata>
    & {
      head: (
        endpoint: string,
        options?: RestFullOptions,
      ) => Promise<Response>
    }

  /**
   * Creates the REST client, merging the given options with the default JSON content headers.
   *
   * Accepts a bare `contextId` string, same as the base {@link ZanixConnector} — required for a
   * `RestClient` subclass to satisfy `ZanixConnectorClass<T>` (`new (contextId?: string) => T`),
   * the constructor shape `this.connectors.get(SomeRestClientSubclass)`'s class-based overload
   * expects. Before this, any subclass that never overrode the constructor (the common case)
   * inherited an options-object-only constructor, so passing the class itself to `.get()` failed
   * every overload — not a consumer mistake, a real gap between this class and its own base.
   */
  constructor(options: string | RequestOptions = {}) {
    const { contextId, autoInitialize, ...restOptions } = typeof options === 'string'
      ? { contextId: options } as RequestOptions
      : options

    super({ contextId, autoInitialize })
    this.#httpOptions = {
      ...restOptions,
      headers: { ...JSON_CONTENT_HEADER, ...restOptions.headers },
    }

    this.http = {
      // `#put`/`#post`/etc. stay loosely typed internally (`<T>(endpoint, options?) => Promise<T>`)
      // — the same shape every branch inside `#http` already relies on its own `as T` casts for
      // (the 304/204/HEAD/metadata-wrapped cases each return a differently-shaped value under one
      // generic). The precise, two-shape public contract (`RestMethodWithMetadata`) is enforced at
      // this one assignment boundary instead, the same "loose internals, precise public type" split
      // several other Zanix modules already use.
      put: this.#put.bind(this) as RestMethodWithMetadata,
      post: this.#post.bind(this) as RestMethodWithMetadata,
      delete: this.#delete.bind(this) as RestMethodWithMetadata,
      get: this.#get.bind(this) as RestMethodWithMetadata,
      patch: this.#patch.bind(this) as RestMethodWithMetadata,
      head: this.#head.bind(this),
      options: this.#options.bind(this) as RestMethodWithMetadata,
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

  /**
   * Resolves where the `ETag` cache lives for this call — `undefined` when `useEtag` is `false`, so
   * callers never need a second `useEtag` check of their own. Otherwise: the `'cache:local'` core
   * connector slot, if a package that owns it (e.g. `@zanix/datamaster`) is registered; the
   * module-level `etagCache` `Map` when nothing is registered, so `RestClient` keeps working
   * standalone. Re-resolved on every call (never cached on `this`) since the slot's registration —
   * or a test's own stand-in for it — can change between calls, same reasoning as
   * `dispatchWorkerTask`'s own per-call resolution of the `'worker'` core provider slot.
   */
  #resolveEtagCache(useEtag: boolean): EtagCacheStore | undefined {
    if (!useEtag) return undefined

    try {
      return getConnectors(this.contextId, false).get<
        ZanixCacheConnector<string, EtagCacheEntry>
      >('cache:local') ?? etagCache
    } catch {
      return etagCache
    }
  }

  /**
   * Builds the `ReloadMetadata` a `metadata: true` call attaches — `url`/`options` are always the
   * already-fully-resolved values `#http` itself is about to `fetch()` with, so this never
   * recomputes anything (no second URL join, no second header merge). See
   * {@link reloadableHeaders}'s own doc for why `headers` is filtered, never copied wholesale.
   */
  #buildReloadMetadata(method: string, url: string, options: RestFullOptions): ReloadMetadata {
    const sourceHeaders = new Headers(options.headers)
    const headers: Record<string, string> = {}
    for (const name of this.reloadableHeaders) {
      const value = sourceHeaders.get(name)
      if (value !== null) headers[name] = value
    }

    return {
      endpoint: url,
      method,
      headers,
      body: typeof options.body === 'string' ? options.body : undefined,
    }
  }

  #post = <T>(endpoint: string, options?: RestFullOptions) =>
    this.#http<T>('POST', endpoint, options)

  #get = <T>(endpoint: string, options?: RestFullOptions) => this.#http<T>('GET', endpoint, options)

  #put = <T>(endpoint: string, options?: RestFullOptions) => this.#http<T>('PUT', endpoint, options)

  #delete = <T>(endpoint: string, options?: RestFullOptions) =>
    this.#http<T>('DELETE', endpoint, options)

  #patch = <T>(endpoint: string, options?: RestFullOptions) =>
    this.#http<T>('PATCH', endpoint, options)

  #options = <T>(endpoint: string, options?: RestFullOptions) =>
    this.#http<T>('OPTIONS', endpoint, options)

  #head = (endpoint: string, options?: RestFullOptions): Promise<Response> =>
    this.#http<Response>('HEAD', endpoint, options)

  #http = async <T = unknown>(
    method: string,
    endpoint: string,
    options?: RestFullOptions,
  ): Promise<T> => {
    options = {
      ...this.#httpOptions,
      ...options,
      headers: { ...this.#httpOptions.headers, ...options?.headers },
    }

    const baseUrl = options.baseUrl
    delete options.baseUrl

    const useEtag = this.shouldUseEtag(method, options)

    delete options.etag

    const wantsMetadata = options.metadata === true
    delete options.metadata

    const [protocol, restOfUrl] = (baseUrl ? `${baseUrl}/${endpoint}` : endpoint).split('://')

    if (!restOfUrl) {
      throw new HttpError('CONFLICT', {
        cause: '[RestClient]: invalid url',
        message: 'Rest Client Http Error',
        meta: { source: 'zanix', baseUrl },
      })
    }

    const url = `${protocol}:/${cleanRoute(restOfUrl, true)}`
    const cacheKey = `${url} ${identityKey(options.headers, this.etagIdentityHeaders)}`
    const etagCacheStore = this.#resolveEtagCache(useEtag)

    // Built once, reused for every successful-return branch below — never for the two error
    // branches (a caller replaying a failed call gets nothing useful to reload).
    const withMetadata = <V>(data: V): T =>
      (wantsMetadata
        ? { data, reloadMetadata: this.#buildReloadMetadata(method, url, options) }
        : data) as T

    const cached = etagCacheStore?.get(cacheKey)
    if (cached) {
      options.headers = { ...options.headers, 'If-None-Match': cached.etag }
    }

    try {
      const response = await fetch(url, { method, ...options })

      // A `304` only ever comes back for a request THIS client conditioned on `If-None-Match`
      // (i.e. `cached` is set) — the cached value from that same ETag is still current.
      if (response.status === 304 && cached) {
        return withMetadata(cached.value)
      }

      if (!response.ok) {
        const text = await response.text()
        // `BAD_GATEWAY`, not `BAD_REQUEST` — this client has no domain knowledge of whose fault a
        // non-2xx upstream response is: it might be OUR caller's bad input (worth a real 4xx), or
        // it might be a genuine fault in whatever we called (never the caller's fault). Only the
        // specific consumer of THIS response — the one thing with that context — can tell the
        // difference; defaulting to "my dependency failed" here is the honest default, not "you
        // sent something wrong". The real upstream status/body survive structured in `meta`
        // (`upstreamStatus`/`upstreamStatusText`, not buried in a message string) precisely so a
        // caller with that context CAN reclassify — see `OAuth2Connector.exchangeCode`'s own doc
        // for a real example.
        throw new RestClientError('BAD_GATEWAY', {
          cause: new Error(`[HTTP ${response.status}]: ${response.statusText}\n${text}`),
          message: 'Rest Client Http Error',
          meta: {
            source: 'zanix',
            url,
            upstreamStatus: response.status,
            upstreamStatusText: response.statusText,
          },
        })
      }

      if (method === 'HEAD') {
        return response as T
      }

      if (response.status === 204 || response.status === 205) {
        return withMetadata(undefined)
      }

      const text = await response.text()

      const value = response.headers
          .get('Content-Type')
          ?.includes(JSON_CONTENT_HEADER['Content-Type'])
        ? (text ? JSON.parse(text) : undefined)
        : text

      const etag = response.headers.get('ETag')
      if (etag) etagCacheStore?.set(cacheKey, { etag, value })

      return withMetadata(value)
    } catch (e) {
      // Already a well-formed `HttpError` (the `!response.ok` branch above built one, with the
      // real upstream status structured in its own `meta`) — pass it through unchanged, don't
      // re-wrap it into a second, less specific layer. Anything else reaching here is a genuine
      // transport-level failure (`fetch()` itself rejected — DNS, timeout, connection refused) with
      // no real response to report a status from at all; `BAD_GATEWAY` is the honest default for
      // that too, same reasoning as above.
      if (e instanceof HttpError) throw e

      throw new RestClientError('BAD_GATEWAY', {
        cause: e,
        message: 'Rest Client Http Error',
        meta: { source: 'zanix', url },
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

/**
 * Thrown by {@link RestClient} for any failed call — a non-2xx upstream response, or a genuine
 * transport-level failure (DNS, timeout, connection refused). `RestClient` itself has no domain
 * knowledge of whose fault a non-2xx response is — a consumer's own bad input, or a genuine fault
 * in whatever it called — so it always defaults to `'BAD_GATEWAY'` as the honest status (see
 * `#http()`'s own doc). The real upstream status, when one exists, survives structured in
 * `meta.upstreamStatus`/`meta.upstreamStatusText` and is readable directly off the error via
 * {@link RestClientError.realHttpStatus}, for whichever caller DOES have the context to
 * reclassify with it.
 *
 * @example
 * ```ts
 * try {
 *   await client.http.get('/users/1')
 * } catch (error) {
 *   if (error instanceof RestClientError && error.realHttpStatus === 404) {
 *     // the resource genuinely doesn't exist upstream — not "my dependency is down"
 *   }
 * }
 * ```
 */
export class RestClientError extends HttpError {
  /**
   * The real HTTP status code the upstream call actually received. `undefined` for a genuine
   * transport-level failure — no response came back at all, so there's no real status to report.
   */
  public get realHttpStatus(): number | undefined {
    const upstreamStatus = this.meta?.upstreamStatus
    return typeof upstreamStatus === 'number' ? upstreamStatus : undefined
  }
}
