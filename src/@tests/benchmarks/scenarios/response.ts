// deno-coverage-ignore-file

/**
 * Response generation and serialization — the last thing the runtime does on every request, and
 * the only phase whose cost is dominated by payload SIZE rather than by route or middleware count.
 *
 * `getResponseInterceptor` is the single place a handler's return value becomes a `Response`, with
 * three distinct paths (string / already-a-`Response` / anything else → JSON), so all three are
 * measured. The JSON path is measured at three payload sizes, since it is the one that scales.
 *
 * @module
 */
import type { Scenario } from '../setup.ts'
import type { HandlerFunction } from 'typings/router.ts'

import { getResponseInterceptor } from 'middlewares/defaults/response.interceptor.ts'
import { getSerializedErrorResponse, httpErrorResponse } from 'utils/errors/helper.ts'
import { gzipResponse, gzipResponseFromResponse, gzipStreamingResponse } from 'utils/gzip.ts'
import { buildLivenessHandler, buildReadinessHandler } from 'modules/webserver/health.ts'
import { JSON_CONTENT_HEADER } from 'utils/constants.ts'
import { HttpError } from '@zanix/errors'

import {
  makeContext,
  makePayload,
  makeRequest,
  makeSsrLikeResponse,
  PAYLOAD_JSON,
  readFirstChunk,
  SSR_TAIL_CHUNKS,
} from '../fixtures.ts'
import { PAYLOAD_SIZES, type SizeLabel } from '../setup.ts'

/**
 * Deterministic facts about one time-to-first-byte path, returned BY the scenario itself.
 *
 * `pulls` is how many chunks the source stream had to produce before the consumer got its first
 * byte — 1 for a genuinely streaming path, {@linkcode SSR_TAIL_CHUNKS}` + 1` for one that buffered
 * the whole body first. Returning it (rather than deriving it in a separate, parallel setup) is
 * what lets `src/@tests/performance/validity.ts` prove these three scenarios really do measure
 * three different things, using the exact objects the benchmark measures and no second copy of
 * their setup. The extra object costs one allocation per iteration against a stream construction
 * plus a compression pass — far below the noise floor of what is being timed.
 */
export interface FirstChunkFacts {
  /** Source chunks produced before the first byte reached the consumer. */
  pulls: number
  /** Byte length of that first chunk. */
  bytes: number
}

async function firstChunkFacts(
  wrap: (response: Response) => Response | Promise<Response>,
): Promise<FirstChunkFacts> {
  const { response, pulls } = makeSsrLikeResponse()
  const chunk = await readFirstChunk(await wrap(response))
  return { pulls: pulls(), bytes: chunk?.length ?? 0 }
}

/** Builds the response scenarios. See {@linkcode createContextScenarios} for why this is a
 * factory. */
export function createResponseScenarios(): Scenario[] {
  const context = makeContext(makeRequest('/orgs/acme/members'))
  // Built once, outside every measured region — see `makeRequest`'s own doc.
  const healthRequest = makeRequest('/health')
  const readyRequest = makeRequest('/ready')

  const stringHandler = (() => 'ok') as HandlerFunction
  const responseHandler = (() => new Response('ok')) as HandlerFunction

  const notFound = new HttpError('NOT_FOUND', { meta: { path: '/unknown' } })

  const liveness = buildLivenessHandler() as unknown as (req: Request) => Response
  // No connectors are registered in this process and the three checks are pure functions, so this
  // stays fully in-process and deterministic — it measures the readiness handler's own
  // aggregation work, never a real dependency's health.
  const readiness = buildReadinessHandler(
    new Map([['main', {
      queue: () => true,
      cache: () => true,
      storage: () => true,
    }]]),
  ) as unknown as (req: Request) => Promise<Response>

  const scenarios: Scenario[] = [
    {
      key: 'response:handler:string',
      name: 'getResponseInterceptor() — handler returns a string',
      group: 'response-build',
      baseline: true,
      run: () => getResponseInterceptor(context, null as never, stringHandler),
    },
    {
      key: 'response:handler:response',
      name: 'getResponseInterceptor() — handler already returns a Response',
      group: 'response-build',
      run: () => getResponseInterceptor(context, null as never, responseHandler),
    },
  ]

  for (const size of Object.keys(PAYLOAD_SIZES) as SizeLabel[]) {
    const payload = makePayload(size)
    const handler = (() => payload) as HandlerFunction
    scenarios.push({
      key: `response:json:${size}`,
      // See `Scenario.skipDenoBench`: this exact scenario, alone, exhausts the V8 heap under
      // `Deno.bench` in Deno 2.9.5. The regression gate still measures it.
      skipDenoBench: size === 'large',
      name: `getResponseInterceptor() — JSON.stringify + Response (${size}, ${
        PAYLOAD_SIZES[size]
      } items)`,
      group: 'response-json',
      baseline: size === 'small',
      run: () => getResponseInterceptor(context, null as never, handler),
    })
  }

  scenarios.push(
    {
      key: 'response:error:serialize',
      name: 'getSerializedErrorResponse() — HttpError → JSON string',
      group: 'response-error',
      baseline: true,
      run: () => getSerializedErrorResponse(notFound, context.id),
    },
    {
      key: 'response:error:http',
      name: 'httpErrorResponse() — HttpError → 404 Response',
      group: 'response-error',
      run: () => httpErrorResponse(notFound, { contextId: context.id }),
    },
    {
      key: 'response:health:liveness',
      name: 'buildLivenessHandler() — /health response',
      group: 'response-health',
      baseline: true,
      run: () => liveness(healthRequest),
    },
    {
      key: 'response:health:readiness',
      name: 'buildReadinessHandler() — /ready with 3 in-process checks',
      group: 'response-health',
      run: () => readiness(readyRequest),
    },
    {
      // Gzip is measured WITH the body fully drained: `gzipResponse` returns a `Response` whose
      // body is a live `CompressionStream`, so a number that stopped at the call itself would
      // measure stream setup and never a single compressed byte.
      key: 'response:gzip:medium',
      name: `gzipResponse() — compress + drain a medium JSON body (${PAYLOAD_SIZES.medium} items)`,
      group: 'response-gzip',
      baseline: true,
      run: async () => {
        const response = gzipResponse(PAYLOAD_JSON.medium)
        return await response.arrayBuffer()
      },
    },
    {
      key: 'response:gzip:from-response:medium',
      name: 'gzipResponseFromResponse() — buffer + compress + drain a medium JSON Response',
      group: 'response-gzip',
      run: async () => {
        const source = new Response(PAYLOAD_JSON.medium, { headers: JSON_CONTENT_HEADER })
        const compressed = await gzipResponseFromResponse(source)
        return await compressed.arrayBuffer()
      },
    },
    // --- Streaming SSR time-to-first-byte -----------------------------------------------------
    // A DIFFERENT question from the three gzip throughput scenarios above, and one they are
    // structurally incapable of answering: they drain the whole body, so they measure compression
    // throughput and would not move at all if the response stopped streaming. `gzipStreamingResponse`
    // exists specifically so a streamed SSR render keeps its time-to-first-byte when the client
    // sends `Accept-Encoding: gzip` — the buffering compressor (`gzipResponseFromResponse`, which
    // reads the entire body via `clone().arrayBuffer()` before emitting a byte) silently converts
    // such a response into a buffered one. These three scenarios measure the first chunk only, so
    // that difference is visible; the deterministic version of the same check — how many source
    // chunks each path pulls before its first byte — is asserted in
    // `src/@tests/performance/validity.ts`, and it, not the timing, is what actually gates.
    {
      key: 'response:stream:ttfb:plain',
      name: `streaming SSR — first chunk, no compression (${SSR_TAIL_CHUNKS} tail chunks pending)`,
      group: 'response-stream-ttfb',
      baseline: true,
      run: () => firstChunkFacts((response) => response),
    },
    {
      key: 'response:stream:ttfb:gzip',
      name: 'streaming SSR — first chunk through gzipStreamingResponse()',
      group: 'response-stream-ttfb',
      run: () => firstChunkFacts(gzipStreamingResponse),
    },
    {
      key: 'response:stream:ttfb:buffered',
      name: 'streaming SSR — first chunk through gzipResponseFromResponse() (buffers everything)',
      group: 'response-stream-ttfb',
      run: () => firstChunkFacts(gzipResponseFromResponse),
    },
  )

  return scenarios
}
