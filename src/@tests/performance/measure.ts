// deno-coverage-ignore-file

// deno-lint-ignore-file no-await-in-loop -- Every loop in this file is sequential BY DESIGN and
// must stay that way: a benchmark iteration measures one operation running alone, and letting a
// batch's iterations overlap would measure the event loop's fan-out instead. Running rounds or
// scenarios concurrently would additionally have them competing for the same core.

/**
 * The sampler the performance regression gate runs scenarios through.
 *
 * It deliberately does NOT parse `deno bench`'s output. Doing so would couple a test to a
 * human-facing report format, and — more importantly — would make the gate measure a DIFFERENT
 * execution than the one it claims to protect. Instead, both layers of this suite consume the very
 * same {@linkcode Scenario} objects (`src/@tests/benchmarks/scenarios/`): `deno bench` registers
 * their `run` with `Deno.bench`, and this module times the identical `run` directly. The absolute
 * numbers the two produce are close but not identical (different harnesses, different iteration
 * strategies), which is exactly why the recorded baselines in `baseline.ts` come from THIS
 * sampler, never from a `deno bench` table.
 *
 * ### Method
 *
 * 1. **Warm up** for a fixed wall-clock budget, so V8 has tiered the scenario up and any
 *    first-call allocation (route regex caches, hidden-class transitions) has already happened.
 * 2. **Calibrate** a batch size by doubling until one batch takes long enough to be timed
 *    meaningfully, then scale it to {@linkcode MeasureOptions.targetRoundMs}. Scenario costs in
 *    this suite span roughly three orders of magnitude (a UUID vs. a 1000-item JSON round trip),
 *    so a single fixed iteration count would either be statistically useless for the fast ones or
 *    take minutes on the slow ones.
 * 3. **Sample** several independent rounds and report the FASTEST one's throughput.
 * 4. **Report the spread** (coefficient of variation across rounds, plus the full observed range)
 *    alongside it — that number, not a guess, is what decides in `baseline.ts` whether a scenario
 *    is stable enough to become a gate at all, and how wide its regression margin has to be.
 *
 * ### Why the fastest round, not the mean or the median
 *
 * Every source of error on this measurement is ADDITIVE and one-directional: a GC pause, a
 * descheduled thread, another process taking the core, or — on Apple Silicon specifically — the
 * process being migrated onto an efficiency core mid-run, all make a round slower and none of them
 * can make it faster than the code actually is. Under that error model the fastest round is the
 * least-contaminated estimate of the code's own cost, and the mean and median are estimates of
 * "the code plus however busy the machine happened to be".
 *
 * This was not assumed, it was measured, twice. Ten runs recorded under each estimator, same
 * scenarios, same machine, same sampler: under the fastest-round estimator the run-to-run drop had
 * a median of 6.4% and a 90th percentile of 17.8%; under a median-round estimator the same
 * scenarios moved by a median of 52.7%, with a 90th percentile of 80.9% — and produced baselines 5
 * to 18 times lower. That gap is not the code being slower; it is the median faithfully reporting
 * how contended the machine was during most rounds, on a machine that was genuinely busy. A
 * regression gate built on it would be measuring the build agent, not the package.
 *
 * The spread is still reported either way, and scenarios whose spread stays wide even under this
 * estimator are still refused a gate — see `baseline.ts`.
 *
 * @module
 */
import type { Scenario } from '../benchmarks/setup.ts'

/** Tunables for {@linkcode measureScenario}. */
export interface MeasureOptions {
  /** Wall-clock warm-up budget, in milliseconds, before any timing is kept. */
  warmupMs: number
  /** How many independent timed rounds to sample. More rounds means a better chance that at
   * least one of them ran without interference. */
  rounds: number
  /** Target duration of one round, in milliseconds — drives the calibrated batch size. */
  targetRoundMs: number
}

/**
 * The ONE sampling configuration used by both the regression gate and the baseline recorder.
 *
 * These deliberately are not two different settings. An earlier version gave the recorder a
 * roughly 4× larger sampling budget, on the reasoning that a baseline is written once and trusted
 * for a long time — which quietly broke the comparison: with the fastest-round estimator, more
 * rounds means more chances at an uninterrupted one, so the recorder's estimate sat
 * SYSTEMATICALLY above what the gate could reach on the same machine with the same code. Every
 * margin then had to silently absorb that bias on top of real noise, and gates started failing on
 * a healthy machine. A baseline earns its confidence from being recorded across several
 * independent RUNS, not from each run being measured differently than the gate will measure it.
 *
 * The budget itself favors MANY SHORT rounds over few long ones, at the same total cost: under the
 * fastest-round estimator a round only has to be long enough to time accurately, and what actually
 * improves the estimate is having more independent chances at a round that no GC pause or
 * scheduler hiccup landed in.
 */
export const GATE_OPTIONS: MeasureOptions = { warmupMs: 50, rounds: 15, targetRoundMs: 12 }

/** What one measured scenario produced. */
export interface MeasureResult {
  key: string
  name: string
  /** Throughput of the FASTEST round, in operations per second. The headline number — see this
   * module's own doc for why the fastest round rather than the mean or the median. */
  opsPerSecond: number
  /** Slowest round observed, in operations per second. */
  minOpsPerSecond: number
  /** Fastest round observed, in operations per second. */
  maxOpsPerSecond: number
  /** Coefficient of variation across rounds (standard deviation / mean), as a percentage. */
  cvPercent: number
  /** Iterations per timed round, as calibrated. */
  batchSize: number
  /** Rounds actually sampled. */
  rounds: number
}

/** Largest calibrated batch — a guard against a scenario so cheap that calibration would ask for
 * tens of millions of iterations per round. */
const MAX_BATCH = 500_000

/**
 * Times `batchSize` back-to-back iterations, returning elapsed milliseconds.
 *
 * The synchronous and asynchronous loops are written out separately, and which one runs is decided
 * ONCE per scenario rather than per iteration. `await` on a non-promise still yields to the
 * microtask queue, so a single shared loop that awaited every iteration would add a tick to every
 * synchronous scenario — a floor of its own, on the same order as the fastest operations this
 * suite measures (`contextId`, `getPrefix`, `pathToRegex`). Measuring a floor instead of the code
 * is the failure mode this whole module is arranged to avoid. `registerScenarios`
 * (`benchmarks/setup.ts`) applies the identical rule for `Deno.bench`.
 */
async function timeBatch(
  scenario: Scenario,
  batchSize: number,
  isAsync: boolean,
): Promise<number> {
  const start = performance.now()
  if (isAsync) {
    for (let i = 0; i < batchSize; i++) await scenario.run()
  } else {
    for (let i = 0; i < batchSize; i++) scenario.run()
  }
  return performance.now() - start
}

/** Measures one scenario. See this module's own doc for the method. */
export async function measureScenario(
  scenario: Scenario,
  options: MeasureOptions = GATE_OPTIONS,
): Promise<MeasureResult> {
  const { warmupMs, rounds, targetRoundMs } = options

  // 0. Decide once, from a single real invocation, whether this scenario is asynchronous.
  const probeResult = scenario.run()
  const isAsync = probeResult instanceof Promise
  if (isAsync) await probeResult

  // 1. Warm up.
  const warmupUntil = performance.now() + warmupMs
  do {
    await timeBatch(scenario, 16, isAsync)
  } while (performance.now() < warmupUntil)

  // 2. Calibrate a batch size that makes one round last about `targetRoundMs`.
  let probe = 1
  let elapsed = 0
  while (probe < MAX_BATCH) {
    elapsed = await timeBatch(scenario, probe, isAsync)
    if (elapsed >= 4) break
    probe *= 4
  }
  const perIterationMs = elapsed / probe
  const batchSize = Math.min(
    MAX_BATCH,
    Math.max(1, Math.round(targetRoundMs / (perIterationMs || targetRoundMs))),
  )

  // 3. Sample.
  const throughputs: number[] = []
  for (let round = 0; round < rounds; round++) {
    const roundMs = await timeBatch(scenario, batchSize, isAsync)
    throughputs.push(batchSize / (roundMs / 1000))
  }

  // 4. Summarize.
  const mean = throughputs.reduce((sum, value) => sum + value, 0) / throughputs.length
  const variance = throughputs.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    throughputs.length
  const cvPercent = mean === 0 ? 0 : (Math.sqrt(variance) / mean) * 100

  return {
    key: scenario.key,
    name: scenario.name,
    opsPerSecond: Math.max(...throughputs),
    minOpsPerSecond: Math.min(...throughputs),
    maxOpsPerSecond: Math.max(...throughputs),
    cvPercent,
    batchSize,
    rounds,
  }
}

/** Measures every scenario, sequentially — never concurrently, which would have them competing
 * for the same core and measuring the scheduler instead of the code. */
export async function measureAll(
  scenarios: Scenario[],
  options: MeasureOptions = GATE_OPTIONS,
): Promise<MeasureResult[]> {
  const results: MeasureResult[] = []
  for (const scenario of scenarios) {
    results.push(await measureScenario(scenario, options))
  }
  return results
}

/** Formats a throughput for a human-readable report. */
export function formatOps(opsPerSecond: number): string {
  if (opsPerSecond >= 1_000_000) return `${(opsPerSecond / 1_000_000).toFixed(2)}M ops/s`
  if (opsPerSecond >= 1_000) return `${(opsPerSecond / 1_000).toFixed(1)}k ops/s`
  return `${opsPerSecond.toFixed(1)} ops/s`
}
