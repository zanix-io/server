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

/** Zanix base context for all target types*/
export type BaseContext = Readonly<{
  id: string
}>

/** Interface context for general scoped target */
export interface ScopedContext extends BaseContext {
  readonly payload: Payload
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
