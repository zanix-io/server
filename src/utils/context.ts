import type { HandlerContext, ScopedContext } from 'typings/context.ts'
import { generateUUID } from '@zanix/helpers'

/**
 * A function to process scoped context payload
 * @param payload
 * @returns
 */
export const processScopedPayload = (
  payload: HandlerContext['payload'],
): ScopedContext['payload'] => {
  return {
    params: (key) => payload.params[key],
    search: (key) => payload.search[key],
    body: (key) => payload.body[key],
  }
}

/**
 * A function to define processed payload accesor
 * @param match
 * @param params
 * @returns
 */
export const payloadAccessorDefinition: (
  match: RegExpMatchArray,
  params: string[],
  // deno-lint-ignore no-explicit-any
) => PropertyDescriptor & ThisType<any> = (match, params) => ({
  set(value) {
    this._computedParams = value
  },
  get() {
    if (this._computedParams) return this._computedParams

    const matchParts = match.slice(1)
    this._computedParams = {}

    for (let i = 0; i < params.length; i++) {
      const value = matchParts[i]
      this._computedParams[params[i]] = value?.slice(1)
    }

    return this._computedParams
  },
})

/**
 * Context Id generator
 * @returns
 */
export const contextId = () => {
  return generateUUID()
}
