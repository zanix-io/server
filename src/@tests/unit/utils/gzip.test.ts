import { assert, assertEquals } from '@std/assert'
import { gzipResponse, gzipResponseFromResponse, gzipStreamingResponse } from 'utils/gzip.ts'

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
  const decompressed = response.body!.pipeThrough(
    new DecompressionStream('gzip'),
  )
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

Deno.test('gzipStreamingResponse: leaves a non-compressible response completely untouched', () => {
  const original = new Response(new Uint8Array([1, 2, 3]), {
    headers: { 'content-type': 'image/png' },
  })

  const response = gzipStreamingResponse(original)

  assertEquals(response, original)
  assertEquals(response.headers.get('content-encoding'), null)
})

Deno.test('gzipStreamingResponse: leaves a bodyless response untouched', () => {
  const original = new Response(null, { status: 204 })

  const response = gzipStreamingResponse(original)

  assertEquals(response, original)
})

Deno.test(
  'gzipStreamingResponse: never buffers the body — returns synchronously and starts producing ' +
    "compressed output while the source stream is still open (proves it can't be doing " +
    'response.clone().arrayBuffer() first, which would have to wait for the stream to close)',
  async () => {
    let releaseSecondChunk: () => void = () => {}
    const secondChunkGate = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve
    })

    const source = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          new TextEncoder().encode('<html><body>' + 'x'.repeat(2000)),
        )
        await secondChunkGate
        controller.enqueue(new TextEncoder().encode('</body></html>'))
        controller.close()
      },
    })
    const original = new Response(source, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })

    // Synchronous: unlike `gzipResponseFromResponse` (async, awaits the full body), this returns
    // immediately without ever waiting on `secondChunkGate`.
    const response = gzipStreamingResponse(original)
    assertEquals(response.headers.get('content-encoding'), 'gzip')
    assertEquals(response.headers.get('content-length'), null)

    // deno-lint-ignore no-non-null-assertion
    const reader = response.body!.getReader()
    const first = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                'timed out — the compressed stream never produced output ' +
                  'while the source was still open, meaning the body got buffered first',
              ),
            ),
          1000,
        )
      ),
    ])
    assert(
      !first.done && first.value.length > 0,
      'expected compressed bytes before the source closed',
    )

    releaseSecondChunk()
    let done = false
    const chunks: Uint8Array[] = first.value ? [first.value] : []
    while (!done) {
      // deno-lint-ignore no-await-in-loop
      const next = await reader.read()
      done = next.done
      if (next.value) chunks.push(next.value)
    }

    const decompressed = new Blob(chunks as never).stream().pipeThrough(
      new DecompressionStream('gzip'),
    )
    const text = await new Response(decompressed).text()
    assertEquals(text, '<html><body>' + 'x'.repeat(2000) + '</body></html>')
  },
)

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
