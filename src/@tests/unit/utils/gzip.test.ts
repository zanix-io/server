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

Deno.test('gzipResponseFromResponse: leaves a bodyless (null-body-status) response untouched', async () => {
  // Real regression coverage, not a hypothetical: a WebSocket upgrade handshake's own response
  // (`Deno.upgradeWebSocket()`, status 101) has `body === null` — the exact same signal
  // `gzipStreamingResponse`'s own bodyless test below already covers. Before this guard, a socket
  // server with gzip enabled crashed on every real browser's WS handshake (which sends
  // `Accept-Encoding: gzip` like any other request) with `TypeError: Response with null body
  // status cannot have body`, since `maybeGzip` always returns SOME body value, even an empty one,
  // and the Fetch API forbids constructing any of these statuses with a body at all.
  const original = new Response(null, { status: 204 })

  const response = await gzipResponseFromResponse(original)

  assertEquals(response, original)
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

    // Decode the wire bytes as they arrive and require the FIRST chunk's actual content before the
    // source closes. Asserting on compressed byte counts alone isn't enough: a compressor that
    // holds input back still emits its 10-byte gzip header immediately (Deno >= 2.9.7's plain
    // `CompressionStream` does exactly this), so "some bytes arrived" proves nothing about flushing.
    const firstChunk = '<html><body>' + 'x'.repeat(2000)
    // deno-lint-ignore no-non-null-assertion
    const reader = response.body!.pipeThrough(new DecompressionStream('gzip')).getReader()
    const decoder = new TextDecoder()
    let received = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              'timed out — the first chunk never became decodable while the source was still ' +
                'open, meaning the compressor is holding input back until the stream closes',
            ),
          ),
        2000,
      )
    })
    try {
      while (received.length < firstChunk.length) {
        // deno-lint-ignore no-await-in-loop -- each read depends on the previous one
        const next = await Promise.race([reader.read(), deadline])
        assert(!next.done, 'the stream ended before the source was released')
        received += decoder.decode(next.value, { stream: true })
      }
    } finally {
      clearTimeout(timer)
    }
    assertEquals(received, firstChunk)

    releaseSecondChunk()
    while (true) {
      // deno-lint-ignore no-await-in-loop -- each read depends on the previous one
      const next = await reader.read()
      if (next.done) break
      received += decoder.decode(next.value, { stream: true })
    }
    assertEquals(received, firstChunk + '</body></html>')
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
