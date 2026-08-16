// deno-coverage-ignore-file

import ProgramModule from 'modules/program/mod.ts'

/** The exact bytes the fixture's route sends across both chunks, exported so the test can assert
 * the final decompressed body matches it exactly, not just that gzip ran. */
export const FIRST_CHUNK = `<html><body>${'x'.repeat(2000)}`
export const SECOND_CHUNK = '</body></html>'
export const FULL_BODY = FIRST_CHUNK + SECOND_CHUNK

let releaseGate: () => void = () => {}
/** The route's handler awaits this before enqueueing {@link SECOND_CHUNK} and closing the stream —
 * held open deliberately so the test can prove the response is already flowing (headers received)
 * before the "render" finishes, which would be impossible if gzip buffered the whole body first. */
const secondChunkGate = new Promise<void>((resolve) => {
  releaseGate = resolve
})

/** Lets the test unblock the fixture's own in-flight stream once it has proven the response
 * started flowing without it. */
export function releaseSecondChunk(): void {
  releaseGate()
}

await ProgramModule.applications.define('gzip-ssr-streaming', () => {
  ProgramModule.routes.defineRoute('ssr', {
    path: '/stream',
    handler: () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(FIRST_CHUNK))
          await secondChunkGate
          controller.enqueue(encoder.encode(SECOND_CHUNK))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }) as never
    },
  })
})
