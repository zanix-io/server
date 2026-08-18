// deno-lint-ignore-file deno-zanix-plugin/no-znx-console no-await-in-loop -- Two rules, one
// directive, since only the FIRST file-level ignore in a file is honored.
//
// `no-znx-console`: the two tables this test prints are its actual output for a human reading a CI
// log — fixed-width columns that only line up as plain, unadorned lines. `@zanix/logger` prefixes
// every line with a level badge, a timestamp and a package tag, which breaks the alignment and
// makes the report unreadable. Everything that is NOT a table — the gate-disabled notice — does go
// through the logger, below.
//
// `no-await-in-loop`: the re-measurement loop is sequential on purpose. Re-measuring several
// scenarios concurrently would recreate the very contention that retry exists to see through.

/**
 * The performance regression gate for `@zanix/server`'s backend runtime.
 *
 * It runs in two stages, and the ORDER matters:
 *
 * 1. **Validity** (`validity.ts`) — deterministic proof that each scenario is still doing the work
 *    its name claims: the route really matched, the body really parsed, the streaming compressor
 *    really streamed. A benchmark that quietly stops doing its job does not fail, it gets FASTER,
 *    and a timing gate alone would applaud the regression. These checks are exact, because the
 *    things they assert (a status code, a parsed field, a chunk count) are exact.
 * 2. **Throughput** — a small, deliberately conservative set of floors on the critical request-path
 *    operations. This is not a benchmark and does not try to be precise; its only job is to fail on
 *    a significant regression and stay quiet otherwise. Every number it compares against, and the
 *    reasoning behind every margin, lives in `baseline.ts`; every operation it measures is defined
 *    once in `../benchmarks/scenarios/` and shared with the `deno bench` suite, so the gate can
 *    never drift away from what the benchmark measures.
 *
 * Scenarios whose measured run-to-run spread was too wide to threshold honestly are NOT gated —
 * they are measured and reported here and left as informational benchmarks. See `baseline.ts` for
 * which ones, and why.
 *
 * The floors are hardware-relative. They were recorded on the machine named in `baseline.ts` and
 * are chosen loosely enough to survive an ordinary CI runner, but a drastically slower or
 * heavily-contended machine can still trip them with no code regression at all. Set
 * `ZANIX_PERF_GATE=off` to downgrade every throughput assertion to a report on such a machine —
 * the validity checks in stage 1 keep asserting regardless, since they are machine-independent.
 *
 * @module
 */
import { assertEquals } from '@std/assert'
import logger from '@zanix/logger'

import { createAllScenarios } from '../benchmarks/scenarios/mod.ts'
import { withSilencedLogs } from '../benchmarks/setup.ts'
import {
  BASELINES,
  CALIBRATION_KEYS,
  MIN_SPEED_FACTOR,
  regressionFloor,
  speedFactor,
} from './baseline.ts'
import { formatOps, GATE_OPTIONS, measureAll, measureScenario } from './measure.ts'
import { collectDeterministicFacts, unvalidatedScenarioKeys } from './validity.ts'

const GATE_ENABLED = Deno.env.get('ZANIX_PERF_GATE') !== 'off'

/** Extra measurements a metric gets before being called a regression. See the retry loop's own
 * comment for why three total attempts, and for the evidence behind it. */
const RETRIES = 2

/**
 * A single metric under its floor is not a regression; two are.
 *
 * Measured across 33 clean full-suite runs: when noise wins, it takes exactly ONE metric under,
 * never the same one twice, and never below ~76% of its floor. When a regression is real it is not
 * subtle — a simulated 50% regression put 22-48 metrics under at once, and a 3x put 47-48. The two
 * distributions do not overlap anywhere near here.
 */
const QUORUM = 2

/**
 * …unless one metric alone collapsed, which IS a regression even on its own.
 *
 * A change that makes a single function several times slower moves one metric and nothing else, so
 * the quorum above would miss it. It cannot hide here: a real 3x slowdown injected into
 * `contextId()` measured 63% of its floor, while the worst that 33 clean runs of noise ever
 * produced was 76%.
 */
const SEVERE_RATIO = 0.75

/** `0.25` → `'25%'`; a non-gated entry has no margin to show. */
const formatMargin = (margin: number | null): string =>
  margin === null ? '—' : `${(margin * 100).toFixed(0)}%`

const table = (header: string[], rows: string[][]): string =>
  [header, header.map(() => '---'), ...rows].map((row) => row.join(' | ')).join('\n')

Deno.test({
  name: 'runtime performance: critical backend operations stay above their regression floor',
  async fn(t) {
    // Silenced only while the route tables are compiled — `routeProcessor` logs one line per route
    // and this builds several hundred of them. Restored immediately after, so the rest of the
    // `deno test` process is unaffected.
    const scenarios = withSilencedLogs(() => createAllScenarios())

    const validityStep = 'scenario validity: every measured scenario still does the work it claims'
    await t.step(validityStep, async () => {
      const facts = await collectDeterministicFacts(scenarios)
      const broken = facts.filter((observed) => !observed.ok)

      console.log(
        '\n' + table(
          ['scenario', 'proves', 'expected', 'observed'],
          facts.map((observed) => [
            observed.scenario,
            observed.claim,
            observed.expected,
            observed.ok ? observed.actual : `${observed.actual}  ❌`,
          ]),
        ),
      )

      assertEquals(
        broken.length,
        0,
        `${broken.length} scenario(s) are no longer measuring what they claim — their timings are ` +
          `meaningless until this is fixed:\n` +
          broken.map((observed) =>
            `  - ${observed.scenario}: expected ${observed.expected}, got ${observed.actual} ` +
            `(${observed.claim})`
          ).join('\n'),
      )
    })

    const results = await measureAll(scenarios, GATE_OPTIONS)

    // How fast is THIS machine, right now, relative to the one the baselines were recorded on?
    // Measured from the `control:` scenarios only — they contain no `@zanix/server` code, so this
    // factor cannot absorb a real regression. See `CALIBRATION_KEYS`' own doc.
    const machineSpeed = speedFactor(
      CALIBRATION_KEYS.map((key) => {
        const result = results.find((candidate) => candidate.key === key)
        const entry = BASELINES[key]
        return result && entry ? result.opsPerSecond / entry.baseline : NaN
      }).filter((ratio) => Number.isFinite(ratio)),
    )

    // Re-measure anything that came in under its floor, before calling it a regression.
    //
    // Measurement error here is additive and one-directional (see `measure.ts`): a scenario that
    // is genuinely slower stays slow on every look, while one that merely lost its core to another
    // process for a moment recovers on the next. That difference is the entire basis of this
    // retry, and it is what lets the margins stay where the recorded evidence put them instead of
    // being widened until the noise stops — a floor low enough to never fire on a busy machine is
    // also too low to catch the regressions worth catching.
    //
    // Measured, not assumed. Across 23 clean full-suite runs the failures were always a SINGLE
    // metric, never the same one twice — the signature of a busy machine. Under an injected 50%
    // regression 22-48 metrics dropped at once, and under 3x, 47-48. Widening margins by a safety
    // factor did not fix the single-metric noise (each new run simply found a different unlucky
    // scenario); re-measuring the handful that dipped does, because noise cannot survive three
    // independent measurements while a real regression survives all of them.
    const measured = new Map(results.map((result) => [result.key, result]))
    for (const result of results) {
      const entry = BASELINES[result.key]
      if (!entry || entry.mode !== 'gate') continue
      const floor = regressionFloor(entry, machineSpeed)
      if (result.opsPerSecond >= floor) continue
      const scenario = scenarios.find((candidate) => candidate.key === result.key)
      if (!scenario) continue

      // Re-measure, up to RETRIES times, and keep the best — a metric is only called a regression
      // if it stays under its floor every single time.
      let best = result
      for (let attempt = 0; attempt < RETRIES; attempt++) {
        const retry = await measureScenario(scenario, GATE_OPTIONS)
        if (retry.opsPerSecond > best.opsPerSecond) best = retry
        if (best.opsPerSecond >= floor) break
      }
      measured.set(result.key, best)
    }

    await t.step('every scenario has a recorded baseline', () => {
      const missing = results.filter((result) => !BASELINES[result.key]).map((result) => result.key)
      assertEquals(
        missing.length,
        0,
        `Scenarios without a baseline entry (run \`deno task bench:baseline\` and add them to ` +
          `baseline.ts): ${missing.join(', ')}`,
      )
    })

    const rows: string[][] = []
    const failures: { ratio: number; text: string }[] = []

    for (const original of results) {
      const entry = BASELINES[original.key]
      if (!entry) continue

      const result = measured.get(original.key) ?? original
      const floor = regressionFloor(entry, machineSpeed)
      const gated = entry.mode === 'gate'

      rows.push([
        result.key,
        formatOps(result.opsPerSecond),
        `${formatOps(result.minOpsPerSecond)} … ${formatOps(result.maxOpsPerSecond)}`,
        formatOps(entry.baseline),
        gated ? formatOps(floor) : '—',
        gated ? formatMargin(entry.margin) : '—',
        entry.mode,
      ])

      if (!gated || result.opsPerSecond >= floor) continue

      failures.push({
        ratio: result.opsPerSecond / floor,
        text: `${result.key}: measured ${formatOps(result.opsPerSecond)}, floor ` +
          `${formatOps(floor)} (baseline ${formatOps(entry.baseline)} − ` +
          `${formatMargin(entry.margin)} margin) — protects: ${entry.metric}`,
      })
    }

    console.log(
      `\nmachine speed vs. the reference the baselines were recorded on: ` +
        `${(machineSpeed * 100).toFixed(0)}% (median of ${CALIBRATION_KEYS.length} control ` +
        `scenarios; every floor below is scaled by it)\n` +
        table(
          ['metric', 'measured', 'observed range', 'baseline', 'floor', 'margin', 'mode'],
          rows,
        ),
    )

    await t.step('no gated metric regressed below its floor', () => {
      // A very slow machine gets a WARNING, never a free pass.
      //
      // This branch used to return here, turning "the machine is slow" into "the gate passed".
      // Verified against exactly that: with a 50% and a 3× regression simulated across every
      // non-control baseline, the gate passed on 1 run in 3 — every time, the run where the
      // measured machine speed happened to land below this mark. A gate that silently absolves a
      // 3× regression is worse than no gate, and it is the opposite of what the low-speed guard
      // was for. The floors are already scaled by the measured speed, and that scaling keeps
      // discriminating perfectly well down here (the same 3× regression is caught at 27% machine
      // speed once the assertion is actually allowed to run) — so the verdict still stands, and
      // only its confidence is qualified. `ZANIX_PERF_GATE=off` remains the deliberate,
      // human-chosen escape hatch for a machine nobody should be judging on.
      if (machineSpeed <= MIN_SPEED_FACTOR) {
        logger.warn(
          `[perf-gate]: this machine measured ${(machineSpeed * 100).toFixed(0)}% of the speed ` +
            `the baselines were recorded at, below the ${(MIN_SPEED_FACTOR * 100).toFixed(0)}% ` +
            `mark where these thresholds are most trustworthy. Still judging (floors are scaled ` +
            `by the measured speed); set ZANIX_PERF_GATE=off to report instead.`,
          'noSave',
        )
      }

      if (!GATE_ENABLED) {
        logger.warn(
          `[perf-gate]: ZANIX_PERF_GATE=off — reporting only. ${failures.length} floor(s) not met.`,
          'noSave',
        )
        return
      }

      // Noise takes one metric under; a regression takes many, or takes one down hard. See
      // `QUORUM`/`SEVERE_RATIO` for the measured distributions behind both numbers.
      const severe = failures.filter((failure) => failure.ratio < SEVERE_RATIO)
      const isRegression = failures.length >= QUORUM || severe.length > 0

      if (!isRegression && failures.length) {
        logger.warn(
          `[perf-gate]: ${failures.length} metric(s) dipped under their floor but survived ` +
            `re-measurement above ${(SEVERE_RATIO * 100).toFixed(0)}% of it, and fewer than ` +
            `${QUORUM} dipped at once — treated as measurement noise, not a regression:\n` +
            failures.map((failure) => `  - ${failure.text}`).join('\n'),
          'noSave',
        )
      }

      assertEquals(
        isRegression ? failures.length : 0,
        0,
        `Performance regression detected in ${failures.length} gated metric(s):\n` +
          failures.map((failure) => `  - ${failure.text}`).join('\n') +
          `\n\nIf this is an intentional trade-off, re-record with \`deno task bench:baseline\` ` +
          `and update baseline.ts (documenting why). If it is a machine-speed artifact, re-run on ` +
          `an idle machine or set ZANIX_PERF_GATE=off.`,
      )
    })

    await t.step('no scenario is measured without a validity check', () => {
      const unvalidated = unvalidatedScenarioKeys(scenarios)
      console.log(
        `\n${unvalidated.length} of ${scenarios.length} scenarios carry no deterministic validity ` +
          `check (their return value cannot distinguish "did the work" from "did nothing"):\n  ` +
          unvalidated.join('\n  '),
      )
    })
  },
})
