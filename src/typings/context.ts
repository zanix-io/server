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
  verbose?: boolean
}

/** Zanix base context for all target types */
export type BaseContext = Readonly<{
  id: string
}>

type SessionTypes = 'user' | 'api' | 'anonymous'

/**
 * A Session object that represents a user, API, or anonymous session with related roles and configuration.
 *
 * The `Session` type contains various properties that define the context of the session. It includes:
 * - A required `id`, which is a unique identifier for the session.
 * - A required `type`, which can be one of 'user', 'api', or 'anonymous'.
 * - A required `rateLimit` which defines how many API requests are allowed per time interval.
 * - An optional `scope` field that can either be an array of strings (defining multiple roles or scopes).
 * - The session can also have any other custom properties, thanks to the `Record<string, any>` which allows additional, flexible key-value pairs.
 */
export type Session = {
  id: string
  type: SessionTypes
  rateLimit: number
  scope?: string[]
} & Record<string, any>

/**
 * Context object scoped to the lifetime of a single request.
 *
 * Extends {@link BaseContext} and provides request-specific data such as:
 * - Typed payload accessors (params, query, body)
 * - Session information (if authenticated)
 * - Mutable per-request storage (`locals`)
 *
 * Every request receives a new isolated `ScopedContext`.
 */
export interface ScopedContext extends BaseContext {
  /**
   * Provides typed accessors to different parts of the incoming request payload,
   * including:
   * - Route parameters
   * - URL search/query parameters
   * - Request body fields
   *
   * Useful for ensuring type-safe extraction of client input.
   */
  readonly payload: Payload
  /**
   * Session information associated with the current request.
   *
   * May represent:
   * - An authenticated user session
   * - An API session (machine-to-machine)
   * - An anonymous/guest session
   *
   * Includes identifying information, roles, permissions, and
   * additional session-related configuration.
   *
   * Undefined **when not defined or authenticated**.
   */
  readonly session?: Session
  /**
   * Parsed cookies extracted from the incoming HTTP request.
   *
   * Each key represents the cookie name and the value is the
   * corresponding raw cookie string as sent by the client.
   */
  readonly cookies: Record<string, string>
  /**
   * A per-request mutable container.
   *
   * Can be used by middlewares, handlers to store ephemeral
   * data during the lifetime of the request.
   *
   * Extensions or even singleton services can also make use of this container
   * when they receive the `context` as a parameter,
   * allowing them to attach request-specific data without sharing state
   * across requests.
   */
  locals: Record<string, unknown>
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
 */
export interface HandlerContext<P extends Partial<GenericPayload> = GenericPayload>
  extends BaseContext {
  /** The HTTP request object that contains details about the incoming request. */
  req: Request
  /**
   * The URL associated with the incoming request, providing information
   * about the requested resource.
   */
  url: URL
  /**
   * The payload of the request, which contains any relevant data.
   * This is a generic property, allowing flexibility in what data
   * is passed within handlers or middlewares.
   */
  payload: P
  /**
   * Parsed cookies extracted from the incoming HTTP request.
   *
   * Each key represents the cookie name and the value is the
   * corresponding raw cookie string as sent by the client.
   */
  cookies: Record<string, string>
  /**
   * A per-request mutable container.
   *
   * Can be used by middlewares, handlers to store ephemeral
   * data during the lifetime of the request.
   *
   * Extensions or even singleton services can also make use of this container
   * when they receive the `context` as a parameter,
   * allowing them to attach request-specific data without sharing state
   * across requests.
   */
  locals: Record<string, unknown> & {
    /**
     * Temporary session information associated with the current request.
     */
    session?: Session
  }
  /**
   * Session information associated with the current request.
   *
   * May represent:
   * - An authenticated user session
   * - An API session (machine-to-machine)
   * - An anonymous/guest session
   *
   * Includes identifying information, roles, permissions, and
   * additional session-related configuration.
   */
  session?: Session
}
