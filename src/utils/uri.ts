import { ALLOWED_PROTOCOLS, PROTOCOL_REGEX } from './constants.ts'

/**
 * Function to validate an URI
 * @param uri
 * @param validateProtocol
 * @returns {URL}
 */
export const validateURI = (uri: string, validateProtocol = false): URL | undefined => {
  try {
    if (!uri.includes('://')) uri = `https://${uri}`

    const match = uri.match(PROTOCOL_REGEX) || ''
    const protocol = match[1].toLowerCase()

    if (validateProtocol) {
      uri = ALLOWED_PROTOCOLS.includes(protocol) ? uri : ''
    }

    return new URL(uri)
  } catch {
    return undefined
  }
}
