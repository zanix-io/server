// deno-coverage-ignore-file

// deno-lint-ignore-file no-await-in-loop -- Checks run one at a time on purpose: several of them
// exercise the same process-global route registry and scoped-context container, and overlapping
// them would let one check observe another's state.

/**
 * The scenario-validity gate: proof, before any number is trusted, that each measured scenario is
 * actually doing the work its name claims.
 *
 * A benchmark that silently stops doing its job does not fail — it gets FASTER, and reads as an
 * improvement. Every scenario in this suite has a concrete version of that failure available to
 * it:
 *
 * - A route that stops matching turns `lifecycle:param` into a `NOT_FOUND` throw, which is cheaper
 *   than dispatching a handler. The number improves; the server is broken.
 * - `bodyPayloadProperty` swallows a failed parse into `undefined` (its own `catch`), so a body
 *   scenario whose request stopped carrying a parseable body measures an early return.
 * - `findMatchingRoute` returns `undefined` on a miss, so a "hit" scenario whose fixture drifted
 *   measures a full scan that finds nothing — and a "miss" scenario whose fixture accidentally
 *   matches measures an early exit.
 * - A streaming time-to-first-byte scenario whose compressor started buffering still returns a
 *   first chunk; only the number of source chunks pulled to produce it reveals the difference.
 *
 * So each check here runs the SAME `Scenario` object the benchmark and the gate run — never a
 * re-created copy of its setup — once, and asserts a DETERMINISTIC property of its return value:
 * a status code, a parsed field, a pull count. Deterministic, which is exactly why these are
 * asserted exactly, while the timings they protect are thresholded loosely or not at all.
 *
 * @module
 */
import type { Scenario } from '../benchmarks/setup.ts'
import type { HttpError } from '@zanix/errors'

import { PAYLOAD_SIZES, ROUTE_TABLE_SIZES, type SizeLabel } from '../benchmarks/setup.ts'
import { SSR_TAIL_CHUNKS } from '../benchmarks/fixtures.ts'

/** One deterministic property of one scenario's own output. */
export interface DeterministicFact {
  /** The scenario key this was observed from. */
  scenario: string
  /** What holding this property proves the scenario is really doing. */
  claim: string
  /** The value the scenario must produce. */
  expected: string
  /** The value it produced. */
  actual: string
  /** Whether they agree. */
  ok: boolean
}

type Observed = Omit<DeterministicFact, 'scenario'>
type Validator = (result: unknown) => Observed | Promise<Observed>

/** Builds an observation. `ok` defaults to exact agreement — the common case; a check with a
 * range (`≤ n`) passes its own verdict instead, since its `expected` is a bound rather than a
 * value. */
const fact = (claim: string, expected: string, actual: string, ok?: boolean): Observed => ({
  claim,
  expected,
  actual,
  ok: ok ?? actual === expected,
})

/** Asserts the scenario produced a real, successful `Response` — not a thrown error or a 404 that
 * would be cheaper to produce than the work being measured. */
const respondsOk = (claim: string): Validator => (result) => {
  const response = result as Response
  const status = response instanceof Response
    ? response.status
    : `not a Response (${typeof result})`
  return fact(claim, '200', String(status))
}

/** Asserts the scenario produced a successful `Response` whose JSON body carries `field`. */
const respondsWith =
  (claim: string, field: string, value: unknown): Validator => async (result) => {
    const response = result as Response
    if (!(response instanceof Response)) return fact(claim, `${field}=${value}`, `not a Response`)
    const body = await response.clone().json().catch(() => undefined) as Record<string, unknown>
    return fact(claim, `200 ${field}=${value}`, `${response.status} ${field}=${body?.[field]}`)
  }

/** Asserts `bodyPayloadProperty` really parsed the request body rather than swallowing a failed
 * read into `undefined`. */
const parsedBody = (size: SizeLabel): Validator => async (result) => {
  const parsed = await result as { total?: number } | undefined
  return fact(
    `the ${size} JSON body was really parsed, not swallowed into undefined`,
    `total=${PAYLOAD_SIZES[size]}`,
    `total=${parsed?.total}`,
  )
}

/** Asserts a route-matching scenario really landed on the branch it claims. */
const matched = (claim: string, shouldMatch: boolean): Validator =>
// deno-lint-ignore require-await
async (result) => fact(claim, shouldMatch ? 'matched' : 'no match', result ? 'matched' : 'no match')

/** Asserts a GraphQL response really carries `data` (and not `errors`) for `field`. A resolver
 * that stopped resolving does not make the handler fail — `execute` returns an `errors` array,
 * which is CHEAPER to produce than the real result. */
const graphqlData =
  (claim: string, field: string, expected: unknown): Validator => async (result) => {
    const response = result as Response
    if (!(response instanceof Response)) return fact(claim, `${field}`, 'not a Response')
    const body = await response.clone().json().catch(() => undefined) as {
      data?: Record<string, unknown>
      errors?: unknown[]
    }
    if (body?.errors) {
      return fact(claim, `data.${field}=${expected}`, `errors: ${body.errors.length}`)
    }
    const value = body?.data?.[field]
    const actual = Array.isArray(value) ? value.length : value
    return fact(claim, `data.${field}=${expected}`, `data.${field}=${actual}`)
  }

/** Asserts the socket reply wrapper really serialized and sent a frame. */
const sentFrames = (claim: string, expected: number): Validator => (result) => {
  const facts = result as { sent?: number; bytes?: number }
  return fact(
    claim,
    `${expected} frame(s) sent`,
    `${facts?.sent} frame(s) sent`,
    facts?.sent === expected && (expected === 0 || (facts?.bytes ?? 0) > 0),
  )
}

/** Asserts a time-to-first-byte path pulled the expected number of source chunks. */
const pulled = (claim: string, expected: number | { atMost: number }): Validator => (result) => {
  const pulls = (result as { pulls?: number })?.pulls
  return typeof expected === 'number'
    ? fact(claim, `${expected} source chunks`, `${pulls} source chunks`)
    : fact(
      claim,
      `≤ ${expected.atMost} source chunks`,
      `${pulls} source chunks`,
      typeof pulls === 'number' && pulls <= expected.atMost,
    )
}

function buildValidators(): Record<string, Validator> {
  const validators: Record<string, Validator> = {
    'lifecycle:absolute': respondsOk('the static route really matched and ran its handler'),
    'lifecycle:param': respondsWith(
      'the :param route really matched and the handler really read its param',
      'id',
      '42',
    ),
    'lifecycle:catchall': respondsWith(
      'the catch-all route really matched across all its nested segments',
      'path',
      'img/icons/logo.svg',
    ),
    'lifecycle:middleware3': respondsOk(
      'the 3-guard / 2-pipe / 2-interceptor route ran the whole chain to a response',
    ),
    'lifecycle:multiplexer': respondsOk(
      'the multiplexer really dispatched to its prefixed handler',
    ),
    'lifecycle:notfound': (result) => {
      const code = (result as HttpError)?.status?.code
      return fact(
        'the unmatched path is fast because it 404s, not because it silently matched something',
        'NOT_FOUND',
        String(code),
      )
    },
    'context:body:none': async (result) =>
      fact(
        'the GET fast path really returns without reading a body',
        'undefined',
        String(await result),
      ),
    'routing:match:miss:large': matched(
      'the miss scenario really scans the whole table without finding anything',
      false,
    ),
    'routing:match:catchall': matched('the catch-all table really matched', true),
    'middleware:cors:preflight': (result) => {
      const response = (result as { response?: Response })?.response
      return fact(
        'the preflight really short-circuited with its own Response',
        '204',
        String(response?.status),
      )
    },
    'middleware:guard:default': (result) => {
      const headers = (result as { headers?: Headers })?.headers
      return fact(
        'the built-in guards really produced their CORS headers',
        'Access-Control-Allow-Origin set',
        headers?.get('Access-Control-Allow-Origin') ? 'Access-Control-Allow-Origin set' : 'missing',
      )
    },
    'response:stream:ttfb:plain': pulled(
      'the uncompressed stream really yields its shell without producing the tail',
      { atMost: 2 },
    ),
    'response:stream:ttfb:gzip': pulled(
      'gzipStreamingResponse really streams — first byte out before the body is produced',
      { atMost: 4 },
    ),
    'response:stream:ttfb:buffered': pulled(
      'gzipResponseFromResponse really buffers the WHOLE body first — the regression this ' +
        'scenario pair exists to detect, and the reason SSR must not use it',
      SSR_TAIL_CHUNKS + 1,
    ),
  }

  validators['graphql:request:ping'] = graphqlData(
    'the GraphQL handler really executed its resolver instead of returning errors',
    'ping',
    'pong',
  )
  validators['graphql:request:mutation'] = graphqlData(
    'the mutation really executed its resolver',
    'record',
    'recorded:bench',
  )
  // deno-lint-ignore require-await
  validators['graphql:schema:build'] = async (result) => {
    const schema = result as { getQueryType?: () => { getFields: () => Record<string, unknown> } }
    const fields = schema?.getQueryType?.()?.getFields?.() ?? {}
    return fact(
      "the compiled schema really carries this Application's registered Query fields",
      'items + ping',
      `${Object.keys(fields).sort().join(' + ')}`,
    )
  }
  validators['sockets:message:no-reply'] = sentFrames(
    'a handler that returns nothing really sends nothing',
    0,
  )
  // deno-lint-ignore require-await
  validators['sockets:reject:non-upgrade'] = async (result) => {
    const code = (result as HttpError)?.status?.code
    return fact(
      'a non-upgrade request is rejected, not silently accepted',
      'METHOD_NOT_ALLOWED',
      String(code),
    )
  }

  for (const size of Object.keys(PAYLOAD_SIZES) as SizeLabel[]) {
    validators[`sockets:message:reply:${size}`] = sentFrames(
      `the ${size} reply is really serialized and sent as one frame`,
      1,
    )
    validators[`graphql:request:items:${size}`] = graphqlData(
      `the ${size} list query really resolved all its items`,
      'items',
      PAYLOAD_SIZES[size],
    )
    validators[`context:body:json:${size}`] = parsedBody(size)
    validators[`lifecycle:json:${size}`] = respondsWith(
      `the ${size} POST really parsed its body and answered with what it read`,
      'received',
      PAYLOAD_SIZES[size],
    )
  }

  for (const size of Object.keys(ROUTE_TABLE_SIZES) as SizeLabel[]) {
    validators[`routing:match:hit:${size}`] = matched(
      `the ${size} table's last route is really reached by a full scan`,
      true,
    )
    validators[`lifecycle:param:table:${size}`] = respondsOk(
      `the last route of the ${size} table really matched and ran`,
    )
  }

  return validators
}

/**
 * Runs every scenario that has a validator exactly once and collects what it proved.
 *
 * Scenarios with no validator are not silently ignored — {@linkcode unvalidatedScenarioKeys}
 * reports them, so adding a scenario without saying how anyone would know it still works is a
 * visible omission rather than an invisible one.
 */
export async function collectDeterministicFacts(
  scenarios: Scenario[],
): Promise<DeterministicFact[]> {
  const validators = buildValidators()
  const facts: DeterministicFact[] = []

  for (const scenario of scenarios) {
    const validate = validators[scenario.key]
    if (!validate) continue
    facts.push({ ...(await validate(await scenario.run())), scenario: scenario.key })
  }

  return facts
}

/** Scenario keys with no deterministic validity check. Kept small and deliberate: a scenario
 * belongs here only when its return value carries nothing that could distinguish "did the work"
 * from "did nothing" (a UUID, a compiled regex, a raw throughput primitive). */
export function unvalidatedScenarioKeys(scenarios: Scenario[]): string[] {
  const validators = buildValidators()
  return scenarios.filter((scenario) => !validators[scenario.key]).map((scenario) => scenario.key)
}
