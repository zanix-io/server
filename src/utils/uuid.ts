import { generateBasicUUID } from '@zanix/helpers'
import { NAMESPACE_URL, v5 } from '@std/uuid'

/**
 * Context Id generator
 * @returns
 */
export const contextId = () => {
  return v5.generate(NAMESPACE_URL, new TextEncoder().encode(generateBasicUUID()))
}
