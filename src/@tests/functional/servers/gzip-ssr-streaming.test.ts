import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

/**
 * P0 fix verification (see the Zanix Space audit's Implementation Roadmap, item P0-1): gzip is
 * adopted by the `ssr` server type the same as every other type, but MUST use a streaming-safe
 * compressor for it — `gzipResponseFromResponse`'s own buffering (`response.clone().arrayBuffer()`)
 * would force the whole SSR render to finish before a single byte reaches the client, silently
 * defeating `renderToReadableStream`'s time-to-first-byte purpose for any real browser (which
 * always sends `Accept-Encoding: gzip`).
 */
Deno.test(
  'gzip: an ssr streaming response starts flowing to the client before the render finishes, and the final gzip-decoded body is still exactly correct',
  async () => {
    const { releaseSecondChunk, FIRST_CHUNK, FULL_BODY } = await import(
      './fixtures/gzip-ssr-streaming.fixture.ts'
    )

    const servers = await bootstrapServers({
      ssr: { port: 4420, application: 'gzip-ssr-streaming' },
    })
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined

    try {
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the SSR server should be listening')

      const fetchPromise = fetch(
        `http://${addr.hostname}:${addr.port}/stream`,
        {
          headers: { 'accept-encoding': 'gzip' },
        },
      )

      // The fixture's route deliberately never finishes its stream until `releaseSecondChunk()` is
      // called below. If gzip buffered the whole body first (the pre-fix behavior), `fetch()`
      // itself would never resolve — Deno.serve can't send a Response until the handler chain
      // returns one, and the buffering path only returns once the WHOLE stream has closed. A
      // resolved race here, with the gate still held, is the proof this is genuinely streaming.
      const outcome = await Promise.race([
        fetchPromise.then(() => 'resolved' as const),
        new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 1000)),
      ])
      assertEquals(
        outcome,
        'resolved',
        'fetch() should resolve (response headers received) before the SSR render finishes — a ' +
          'timeout here means the gzip response is fully buffering the stream again',
      )

      const res = await fetchPromise
      assertEquals(res.headers.get('content-length'), null) // streamed — never a known length upfront

      // Headers alone don't prove bytes are flowing: a compressor that holds input back still lets
      // the response start. Read the first body chunk (decoded by `fetch()` itself) BEFORE the
      // fixture's stream is allowed to finish — it must already carry `FIRST_CHUNK`.
      // deno-lint-ignore no-non-null-assertion
      reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let received = ''
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'timed out — no decodable body bytes arrived while the SSR render was still ' +
                  'running, meaning the gzip stream is holding chunks back until it closes',
              ),
            ),
          5000,
        )
      })
      try {
        while (received.length < FIRST_CHUNK.length) {
          // deno-lint-ignore no-await-in-loop -- each read depends on the previous one
          const next = await Promise.race([reader.read(), deadline])
          assert(!next.done, 'the response ended before the fixture released its second chunk')
          received += decoder.decode(next.value, { stream: true })
        }
      } finally {
        clearTimeout(timer)
      }
      assertEquals(received, FIRST_CHUNK)

      // Only now let the fixture's stream actually finish, and verify the eventual content is
      // still byte-for-byte correct — streaming must not come at the cost of correctness.
      // `fetch()` transparently decodes `content-encoding: gzip` itself (and hides the header once
      // decoded), so the wire-level proof that gzip actually ran lives in the unit tests
      // (`gzip.test.ts`), which inspect the `Response` object directly.
      releaseSecondChunk()
      while (true) {
        // deno-lint-ignore no-await-in-loop -- each read depends on the previous one
        const next = await reader.read()
        if (next.done) break
        received += decoder.decode(next.value, { stream: true })
      }
      assertEquals(received, FULL_BODY)
    } finally {
      // On any failure above the fixture's stream is still open, and a graceful `stop()` waits on
      // in-flight requests forever — release it and drop the body so a failure surfaces as itself
      // instead of a hung test.
      releaseSecondChunk()
      await reader?.cancel().catch(() => {})
      await webServerManager.stop(servers)
    }
  },
)
