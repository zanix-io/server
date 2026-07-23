import type { GzipSettings } from 'typings/general.ts'
import { JSON_CONTENT_HEADER } from './constants.ts'
import { encoder } from '@zanix/helpers'

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
 *
 * The response body is only compressed when its size (in bytes) is greater than or equal to
 * `threshold` AND its `content-type` header matches a compressible type (text, json, javascript,
 * xml, svg, css, html). Otherwise, a clone of the original response is returned unmodified.
 * When compressed, the `content-encoding` header is set to `gzip` and `content-length` is removed.
 *
 * @param {Response} response - The source response to conditionally compress.
 * @param {Object} [options] - Compression options.
 * @param {number} [options.threshold=1024] - Minimum body size, in bytes, required for compression to apply.
 * @returns {Promise<Response>} A new `Response` with the same status/statusText, gzip-compressed when applicable.
 *
 * @example
 * ```ts
 * const response = await fetch('https://example.com/data.json')
 * return gzipResponseFromResponse(response, { threshold: 512 })
 * ```
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
 *
 * The body is encoded and sent with the {@link JSON_CONTENT_HEADER} content-type header, then
 * only compressed when its encoded size (in bytes) is greater than or equal to `threshold`.
 * Otherwise, the response is returned uncompressed. When compressed, the `content-encoding`
 * header is set to `gzip` and `content-length` is removed.
 *
 * @param {string} body - The response body to (optionally) compress. Typically a JSON string.
 * @param {GzipSettings} [options] - Compression options.
 * @param {number} [options.threshold=1024] - Minimum body size, in bytes, required for compression to apply.
 * @returns {Response} A `Response` with `application/json` headers, gzip-compressed when applicable.
 *
 * @example
 * ```ts
 * return gzipResponse(JSON.stringify({ data: largePayload }))
 * ```
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
