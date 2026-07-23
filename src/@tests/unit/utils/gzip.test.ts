import { assert, assertEquals } from '@std/assert'
import { gzipResponse, gzipResponseFromResponse } from 'utils/gzip.ts'

Deno.test('gzipResponse: does not compress a body below the threshold', async () => {
  const response = gzipResponse('{"a":1}')

  assertEquals(response.headers.get('content-encoding'), null)
  assertEquals(await response.text(), '{"a":1}')
})

Deno.test('gzipResponse: compresses a body above the threshold', async () => {
  const body = JSON.stringify({ value: 'x'.repeat(2000) })
  const response = gzipResponse(body)

  assertEquals(response.headers.get('content-encoding'), 'gzip')
  assertEquals(response.headers.get('content-length'), null)

  // deno-lint-ignore no-non-null-assertion
  const decompressed = response.body!.pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(decompressed).text()
  assertEquals(text, body)
})

Deno.test('gzipResponse: honors a custom threshold option', () => {
  const response = gzipResponse('short', { threshold: 1 })

  assertEquals(response.headers.get('content-encoding'), 'gzip')
})

Deno.test('gzipResponseFromResponse: skips non-compressible content types', async () => {
  const original = new Response('x'.repeat(2000), {
    headers: { 'content-type': 'image/png' },
  })

  const response = await gzipResponseFromResponse(original)

  assertEquals(response.headers.get('content-encoding'), null)
  assertEquals(await response.text(), 'x'.repeat(2000))
})

Deno.test({
  name:
    'gzipResponseFromResponse: compresses compressible content above threshold and preserves status',
  fn: async () => {
    const original = new Response('y'.repeat(2000), {
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'text/plain' },
    })

    const response = await gzipResponseFromResponse(original)

    assert(response.headers.get('content-encoding') === 'gzip')
    assertEquals(response.status, 201)
    assertEquals(response.statusText, 'Created')
  },
})

Deno.test('gzipResponse: falls back to the uncompressed body if compression throws', async () => {
  const OriginalCompressionStream = globalThis.CompressionStream

  globalThis.CompressionStream = (() => {
    throw new Error('compression unavailable')
  }) as never

  try {
    const body = JSON.stringify({ value: 'x'.repeat(2000) })
    const response = gzipResponse(body)

    assertEquals(response.headers.get('content-encoding'), null)
    assertEquals(await response.text(), body)
  } finally {
    globalThis.CompressionStream = OriginalCompressionStream
  }
})
