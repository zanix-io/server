// deno-coverage-ignore-file

/**
 * Shared, side-effect-free setup for the `@zanix/server` benchmark suite.
 *
 * The suite is **self-contained by construction**: nothing under `src/@tests/benchmarks/` (or
 * `src/@tests/performance/`) opens a socket, touches the filesystem, reaches a database or depends
 * on any service outside this package. Every scenario runs `@zanix/server`'s own in-process
 * request pipeline against synthetic `Request` objects, so a measured number can only move when
 * THIS package's code moves.
 *
 * @module
 */

/**
 * Runs `fn` with `console`'s logging methods silenced, then restores them.
 *
 * `routeProcessor` (`modules/webserver/helpers/routes.ts`) emits one `logger.info` line per
 * registered route, and the benchmark suite compiles route tables of up to
 * {@linkcode ROUTE_TABLE_SIZES}`.large` routes several times over. Left unsilenced that floods the
 * bench/test reporter's own output and — worse for a benchmark — makes stdout write throughput a
 * component of a measured number. Silencing is scoped to the setup call rather than assigned
 * process-wide (the convention the existing `*.test.ts` files use) precisely because the
 * regression test runs inside the shared `deno test` process, where a permanently-clobbered
 * `console` would leak into every other test file.
 */
export function withSilencedLogs<T>(fn: () => T): T {
  const { log, info, warn, error, debug } = console
  const noop = () => {}
  Object.assign(console, { log: noop, info: noop, warn: noop, error: noop, debug: noop })
  try {
    return fn()
  } finally {
    Object.assign(console, { log, info, warn, error, debug })
  }
}

/** The three input sizes every size-sensitive scenario in this suite is measured at. */
export const PAYLOAD_SIZES = { small: 1, medium: 50, large: 1000 } as const

/** The three route-table sizes every routing/dispatch scenario is measured against. */
export const ROUTE_TABLE_SIZES = { small: 5, medium: 50, large: 200 } as const

/** A size label shared by {@linkcode PAYLOAD_SIZES} and {@linkcode ROUTE_TABLE_SIZES}. */
export type SizeLabel = 'small' | 'medium' | 'large'

/**
 * One measured operation, defined exactly ONCE and consumed by both layers of this suite: the
 * `*.bench.ts` files (`Deno.bench`, baseline evidence, no thresholds) and the performance
 * regression test (`src/@tests/performance/`, which samples the same `run` and compares it against
 * a recorded floor). Sharing this definition is what guarantees the gate can never drift away from
 * what the benchmark actually measures.
 */
export interface Scenario {
  /** Stable identity used as the baseline/threshold key. Never rename without re-baselining. */
  key: string
  /** Human-readable `Deno.bench` name. */
  name: string
  /** `Deno.bench` group — scenarios in the same group are compared against each other. */
  group: string
  /** Whether this scenario is its group's `Deno.bench` baseline. */
  baseline?: boolean
  /**
   * The measured operation. Must be deterministic, self-contained, and safe to call an unbounded
   * number of times: no accumulating state, no external I/O, no reliance on call ordering.
   */
  run: () => unknown | Promise<unknown>
  /**
   * Excluded from the `Deno.bench` layer, while still measured by the regression gate.
   *
   * Reserved for scenarios `Deno.bench` cannot run at all in this Deno version. Its harness
   * ignores the `n`/`warmup` hints for an asynchronous benchmark that allocates a large object
   * graph per iteration, and instead grows until the V8 heap is exhausted: measured in isolation,
   * one such scenario consumed 1.2 GB and was killed with `Fatal JavaScript out of memory` without
   * ever printing a row, taking the whole `deno bench` run down with it. The identical scenario
   * runs 100,000 iterations through this suite's own sampler
   * (`src/@tests/performance/measure.ts`) in 53 MB.
   *
   * So this flag drops nothing from COVERAGE — every scenario marked here is still measured,
   * thresholded and reported by the regression gate, which is the enforcing layer. It only keeps
   * `deno bench` able to produce its table at all. Re-test the flag when upgrading Deno; if the
   * harness stops accumulating, delete it.
   */
  skipDenoBench?: boolean
}

/**
 * Iterations `Deno.bench` is asked to run per scenario, and how many to warm up with.
 *
 * These are a MEMORY bound as much as a time one. Left unbounded, `Deno.bench` runs a scenario for
 * a fixed wall-clock budget and keeps every iteration's timing sample in order to report
 * percentiles — for a scenario at ~16M ops/s that is tens of millions of retained samples, on top
 * of whatever the scenario itself allocates (a `Response`, a context, a compression stream…). With
 * 59 scenarios in one process the run reproducibly exhausted the V8 heap partway through and died
 * with `Fatal JavaScript out of memory`, having produced no table at all.
 *
 * Deno treats both as suggestions for a very fast benchmark and will still run more iterations if
 * it needs them to time accurately, which is exactly the right trade: the numbers stay meaningful
 * and the run stops accumulating without bound. `Deno.bench` remains the coarse, human-facing
 * layer regardless — the statistically careful measurement lives in the regression gate's own
 * sampler (`src/@tests/performance/measure.ts`).
 */
const BENCH_ITERATIONS = { n: 250, warmup: 100 } as const

/**
 * Registers a list of {@linkcode Scenario}s with `Deno.bench`, one bench per scenario.
 *
 * The registered function is deliberately NOT declared `async`: a scenario whose `run` is
 * synchronous must stay synchronous here, or every such measurement would silently include one
 * extra microtask tick from an unnecessary `await`. The performance regression test's own sampler
 * (`src/@tests/performance/measure.ts`) applies the exact same rule, which is what keeps the two
 * layers measuring the same thing.
 */
export function registerScenarios(scenarios: Scenario[]): void {
  for (const scenario of scenarios) {
    if (scenario.skipDenoBench) continue
    Deno.bench(
      scenario.name,
      { ...BENCH_ITERATIONS, group: scenario.group, baseline: scenario.baseline },
      () => {
        const result = scenario.run()
        if (result instanceof Promise) return result.then(() => {})
      },
    )
  }
}
