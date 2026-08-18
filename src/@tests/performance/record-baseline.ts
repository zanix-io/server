// deno-lint-ignore-file deno-zanix-plugin/no-znx-console no-await-in-loop -- Two rules, one
// directive, since only the FIRST file-level ignore in a file is honored.
//
// `no-await-in-loop`: the recording runs are sequential BY DESIGN. Running them concurrently would
// have them competing for the same core and measuring the scheduler instead of the code — the
// exact contamination this whole script exists to average out.
//
// `no-znx-console`: this script's stdout IS its product:
// a fixed-width table and a paste-ready `baseline.ts` block, both of which must come out as plain,
// unadorned lines. `@zanix/logger` prefixes every line with a level badge, a timestamp and a
// package tag, which would make the table unreadable and the paste-ready block unpastable.
// Progress/diagnostic output — anything that is NOT part of the report — does go through the
// logger, below.

/**
 * Re-measures every scenario in the backend benchmark suite several times over and prints both a
 * human-readable summary and a paste-ready `baseline.ts` table.
 *
 * This is the ONLY sanctioned way to produce the numbers in {@linkcode BASELINES}. Thresholds in
 * this suite are never chosen by intuition: each one is derived from repeated measurement on an
 * idle machine, and the observed run-to-run spread — not a convention — is what decides both the
 * regression margin and whether a scenario is eligible to be a gate at all.
 *
 * Usage:
 * ```sh
 * deno task bench:baseline            # 5 independent runs (default)
 * deno task bench:baseline -- --runs=9
 * ```
 *
 * Close everything else first. A baseline recorded on a busy machine bakes that machine's noise
 * into the floor, which is worse than having no floor at all: it produces a gate that is both
 * too loose to catch a real regression and flaky enough to be ignored.
 *
 * @module
 */
import logger from '@zanix/logger'

import { createAllScenarios } from '../benchmarks/scenarios/mod.ts'
import { withSilencedLogs } from '../benchmarks/setup.ts'
import { formatOps, GATE_OPTIONS, measureAll, type MeasureResult } from './measure.ts'

const runsArg = Deno.args.find((arg) => arg.startsWith('--runs='))
const RUNS = runsArg ? Number(runsArg.slice('--runs='.length)) : 5

if (!Number.isInteger(RUNS) || RUNS < 3) {
  logger.error(
    '[bench:baseline]: --runs must be an integer >= 3 — three runs is the minimum a ' +
      'median across runs means anything over.',
  )
  Deno.exit(1)
}

// Silenced only while the route tables are compiled: `routeProcessor` logs one line per route, and
// this script builds several hundred of them.
const scenarios = withSilencedLogs(() => createAllScenarios())
const perKey = new Map<string, { name: string; medians: number[]; cvs: number[] }>()

for (let run = 1; run <= RUNS; run++) {
  logger.info(`[bench:baseline]: run ${run}/${RUNS} — ${scenarios.length} scenarios`, 'noSave')
  // The SAME sampling configuration the gate uses — see `GATE_OPTIONS`'s own doc for why
  // measuring the baseline more thoroughly than the gate ever can is a bug, not a virtue.
  const results: MeasureResult[] = await measureAll(scenarios, GATE_OPTIONS)
  for (const result of results) {
    const entry = perKey.get(result.key) ?? { name: result.name, medians: [], cvs: [] }
    entry.medians.push(result.opsPerSecond)
    entry.cvs.push(result.cvPercent)
    perKey.set(result.key, entry)
  }
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[(values.length - 1) >> 1]

const rows = [...perKey].map(([key, { name, medians, cvs }]) => {
  // The RECORDED baseline is the median across runs of each run's own estimate — deliberately not
  // the best run. A floor derived from the single luckiest measurement this machine ever produced
  // would sit above what an ordinary run reaches, and would fail constantly. Within a run the
  // fastest round is the right estimator (noise is additive, see `measure.ts`); across runs the
  // median is, because a run's estimate is already noise-corrected and what matters now is the
  // typical one.
  const central = median(medians)
  const worst = Math.min(...medians)
  const best = Math.max(...medians)
  return {
    key,
    name,
    /** Median across runs of each run's own estimate — the recorded baseline. */
    baseline: central,
    /** Worst run observed. How far below the baseline a completely healthy machine already goes. */
    worst,
    /** Run-to-run spread as a percentage of the baseline. This is what a margin must absorb. */
    runSpreadPercent: ((best - worst) / central) * 100,
    /** Worst within-run spread observed, across all runs. */
    maxCvPercent: Math.max(...cvs),
    /** How far below the baseline the worst run landed — the minimum defensible margin. */
    worstDropPercent: ((central - worst) / central) * 100,
  }
})

console.log(`\n# Baseline over ${RUNS} runs (${scenarios.length} scenarios)\n`)
console.log(
  ['key', 'baseline', 'worst run', 'run spread %', 'worst drop %', 'max within-run CV %']
    .join(' | '),
)
for (const row of rows.sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(
    [
      row.key,
      formatOps(row.baseline),
      formatOps(row.worst),
      row.runSpreadPercent.toFixed(1),
      row.worstDropPercent.toFixed(1),
      row.maxCvPercent.toFixed(1),
    ].join(' | '),
  )
}

console.log('\n# Paste-ready values for baseline.ts (review every `mode`/`margin` by hand)\n')
for (const row of rows.sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(
    `  '${row.key}': { baseline: ${Math.round(row.baseline)}, worstObserved: ${
      Math.round(row.worst)
    }, observedSpreadPercent: ${row.runSpreadPercent.toFixed(1)}, maxCvPercent: ${
      row.maxCvPercent.toFixed(1)
    } },`,
  )
}

// Explicit, so the process can never linger on a handle the logger or a scenario left open and be
// mistaken for a crash after having already printed its whole report.
Deno.exit(0)
