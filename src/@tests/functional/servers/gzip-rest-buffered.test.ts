import { bootstrapServers, webServerManager } from 'webserver/mod.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'info')

/**
 * Regression check for the P0-1 gzip/streaming fix: non-`ssr` types must keep using the
 * byte-length-aware, buffered compressor (`gzipResponseFromResponse`) exactly as before — this
 * change only had to add a branch for `ssr`, never touch the default path other types rely on.
 *
 * `fetch()` transparently decodes `content-encoding: gzip` itself and hides the header once
 * decoded, so this can only assert the response still round-trips correctly end-to-end — the
 * actual wire-level proof that `gzipResponseFromResponse` (still) runs for this type lives in
 * `gzip.test.ts`'s own unit tests, which inspect the `Response` object directly.
 */
Deno.test(
  'gzip: a rest response above the compression threshold still round-trips correctly end-to-end',
  async () => {
    const { BODY } = await import('./fixtures/gzip-rest-buffered.fixture.ts')

    const servers = await bootstrapServers({
      rest: { port: 4421, application: 'gzip-rest-buffered' },
    })

    try {
      const addr = webServerManager.info(servers[0]).addr
      assert(addr, 'the REST server should be listening')

      // 'rest' anchors under the default 'api' prefix (`resolveGlobalPrefix`'s own default) unless
      // configured otherwise — the fixture's route lives at '/data', so it resolves at '/api/data'.
      const res = await fetch(`http://${addr.hostname}:${addr.port}/api/data`, {
        headers: { 'accept-encoding': 'gzip' },
      })
      assertEquals(await res.text(), BODY)
    } finally {
      await webServerManager.stop(servers)
    }
  },
)
