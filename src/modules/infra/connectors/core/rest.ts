import type { RequestOptions, RestFullOptions } from 'typings/clients.ts'
import type { HttpMethods } from 'typings/router.ts'

import { HttpError } from '@zanix/errors'
import { ZanixConnector } from '../base.ts'
import { JSON_CONTENT_HEADER } from 'utils/constants.ts'
import { cleanRoute } from 'utils/routes.ts'

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
  public http: Record<
    Exclude<Lowercase<HttpMethods>, 'options' | 'head'>,
    <T>(endpoint: string, options?: RestFullOptions) => Promise<T>
  >

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

    const [protocol, restOfUrl] = `${baseUrl}/${endpoint}`.split('://')
    const url = `${protocol}:/${cleanRoute(restOfUrl)}`

    try {
      const response = await fetch(url, {
        method,
        ...options,
        body: JSON.stringify(options.body),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`[HTTP ${response.status}] ${response.statusText}\n${text}`)
      }

      if (response.headers.get('Content-Type') === JSON_CONTENT_HEADER['Content-Type']) {
        return response.json()
      }

      return response.text() as T
    } catch (e) {
      const error = e as HttpError
      throw new HttpError('BAD_REQUEST', {
        cause: error,
        message: 'Rest Client Http Error',
        meta: { source: 'zanix', url, status: error.code },
      })
    }
  }

  protected override initialize(): void {}
  protected override close() {}
  public override isHealthy(): boolean {
    return true
  }
}
