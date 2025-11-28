import type { GzipSettings } from 'typings/general.ts'
import { JSON_CONTENT_HEADER } from './constants.ts'
import { encoder } from './encoder.ts'

const COMPRESSIBLE_REGEX = /(text|json|javascript|xml|svg|css|html)/i

/**
 * Checks if content is compressible based on type and size,
 * then optionally compresses it with GZIP.
 */
function maybeGzip(
  body: Uint8Array,
  headers: HeadersInit,
  threshold = 1024,
): { body: BodyInit; headers: Headers } {
  const hdrs = new Headers(headers)
  const contentType = hdrs.get('content-type') ?? ''
  if (body.byteLength < threshold || !COMPRESSIBLE_REGEX.test(contentType)) {
    return { body: body.slice().buffer, headers: hdrs }
  }

  // Compress using CompressionStream if available
  try {
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(body)
        controller.close()
      },
    })
    const compressed = readable.pipeThrough(new CompressionStream('gzip'))
    hdrs.set('content-encoding', 'gzip')
    hdrs.delete('content-length')
    return { body: compressed, headers: hdrs }
  } catch {
    return { body: body.slice().buffer, headers: hdrs }
  }
}

/**
 * Creates a GZIP-compressed Response from an existing Response if appropriate.
 */
export async function gzipResponseFromResponse(
  response: Response,
  options: { threshold?: number } = {},
): Promise<Response> {
  const { threshold = 1024 } = options
  const clone = response.clone()
  const bodyBuffer = new Uint8Array(await clone.arrayBuffer())
  const { body, headers } = maybeGzip(bodyBuffer, clone.headers, threshold)

  return new Response(body, {
    status: clone.status,
    statusText: clone.statusText,
    headers,
  })
}

/**
 * Creates a GZIP-compressed Response from a string body if appropriate.
 */
export function gzipResponse(
  body: string,
  options: GzipSettings = {},
): Response {
  const { threshold = 1024 } = options
  const headers = JSON_CONTENT_HEADER

  const encoded = encoder.encode(body)
  const { body: finalBody, headers: finalHeaders } = maybeGzip(encoded, headers, threshold)
  return new Response(finalBody, { headers: finalHeaders })
}
