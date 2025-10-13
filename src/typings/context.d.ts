// deno-lint-ignore-file no-explicit-any
import type { BaseRTO } from '@zanix/validator'

type GenericPayload = {
  params: any
  search: any
  body: any
}

declare global {
  /** Payload type */
  type Payload = {
    params: <T extends BaseRTO>(key: keyof T) => T[keyof T]
    search: <T extends BaseRTO>(key: keyof T) => T[keyof T]
    body: <T extends BaseRTO>(key: keyof T) => T[keyof T]
  }

  /** Zanix base context for all target types*/
  type BaseContext = {
    readonly id: string
  }

  /** Interface context for general scoped target */
  interface ScopedContext extends BaseContext {
    readonly payload: Payload
  }

  /** Interface context for handlers and middlewares */
  interface HandlerContext<P extends Partial<GenericPayload> = GenericPayload> extends BaseContext {
    req: Request
    url: URL
    payload: P
  }
}
