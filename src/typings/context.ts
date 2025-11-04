// deno-lint-ignore-file no-explicit-any
import type { BaseRTO } from '@zanix/validator'

type GenericPayload = {
  params: any
  search: any
  body: any
}

/** Payload type */
export type Payload = {
  params: <T extends BaseRTO>(key: keyof T) => T[keyof T]
  search: <T extends BaseRTO>(key: keyof T) => T[keyof T]
  body: <T extends BaseRTO>(key: keyof T) => T[keyof T]
}

/** Different context types for targets */
export type InstanceContext = string | Partial<BaseContext> | undefined

/** Instance options */
export type InstanceOptions = {
  params?: InstanceContext
  keyId?: string
  useExistingInstance?: boolean
}

/** Zanix base context for all target types */
export type BaseContext = Readonly<{
  id: string
}>

/**
 * A Session object that represents a user, API, or anonymous session with related roles and configuration.
 *
 * The `Session` type contains various properties that define the context of the session. It includes:
 * - An optional `id`, which is a unique identifier for the session.
 * - A required `type`, which can be one of 'user', 'api', or 'anonymous'.
 * - An optional `roles` field that can either be an array of strings (defining multiple roles) or one of the specific role types: 'admin', 'superadmin', or 'general'.
 * - A required `config` object that contains session-specific configurations:
 *    - An optional `scope`, which is an array of strings defining the scope of the session.
 *    - A required `rpm` (requests per minute), which is the rate limit for requests.
 *    - Additional dynamic properties can be added to `config` through a flexible `Record<string, any>`.
 * - The session can also have any other custom properties, thanks to the `Record<string, any>` which allows additional, flexible key-value pairs.
 */
export type Session = {
  id?: string
  type: 'user' | 'api' | 'anonymous'
  roles?: string[] | 'admin' | 'superadmin' | 'general'
  config: {
    scope?: string[]
    rpm: number
  } & Record<string, any>
} & Record<string, any>

/** Interface context for general scoped process */
export interface ScopedContext extends BaseContext {
  readonly payload: Payload
  readonly session?: Session
}

/**
 * Represents the context for handlers and middlewares.
 *
 * This interface provides the necessary context to handle HTTP requests and manage payloads
 * within handlers and middleware functions. It extends the base context to include request
 * details, the URL, and a generic payload for flexible data handling.
 *
 * @template P - A generic type representing the payload structure. Defaults to `GenericPayload`
 *               if not provided. The payload is typically used to store data relevant to
 *               the handler or middleware logic.
 *
 * @interface HandlerContext
 * @extends BaseContext
 *
 * @property {Request} req - The HTTP request object that contains details about the incoming request.
 * @property {URL} url - The URL associated with the incoming request, providing information
 *                        about the requested resource.
 * @property {P} payload - The payload of the request, which contains any relevant data.
 *                          This is a generic property, allowing flexibility in what data
 *                          is passed within handlers or middlewares.
 */
export interface HandlerContext<P extends Partial<GenericPayload> = GenericPayload>
  extends BaseContext {
  req: Request
  url: URL
  payload: P
}
