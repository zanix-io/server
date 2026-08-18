// deno-coverage-ignore-file

/**
 * The recorded baselines and regression floors the performance gate compares against.
 *
 * ### How these numbers were produced
 *
 * Two independent sessions of `deno task bench:baseline --runs=5` — ten full measurement runs of
 * all {@linkcode SCENARIO_COUNT} scenarios, both under the exact sampler configuration the gate
 * itself uses (`GATE_OPTIONS`; see its own doc for why recording with a bigger sampling budget
 * than the gate can afford is a bug, not extra rigor). Within a run, a scenario's estimate is its
 * FASTEST round (measurement error here is additive and one-directional; see `measure.ts`). Across
 * runs, its estimate is the MEDIAN of those, and the `baseline` recorded here is the LOWER of the
 * two sessions' medians. Neither session had the machine fully to itself, so `worstObserved` and
 * `observedDropPercent` describe a machine that is busy sometimes — which is what CI is.
 *
 * **Reference machine:** Apple M1, macOS (Darwin 25.5.0), Deno 2.9.5 / V8 15.0.245.2.
 *
 * The 12 GraphQL and WebSocket scenarios were added later, and their rows come from a separate
 * pair of sessions in which the same machine benchmarked at ~40% of the throughput the other 59
 * were recorded at. They are all `pendingBaseline` for that reason — real measurements, but not a
 * reference to threshold against, and not comparable against the other rows in this table. See
 * {@linkcode RATIONALES}.
 *
 * ### What a floor is, and what it is not
 *
 * `regressionFloor(entry)` is `baseline × (1 − margin)`. A gated scenario fails the test when its
 * measured throughput drops below that. Margins come from the observed spread, never from a
 * convention:
 *
 * - `observedDropPercent ≤ 15` → **35% margin**. Catches a regression of roughly 1.55× or worse.
 * - `observedDropPercent ≤ 30` → **45% margin**. Catches a regression of roughly 1.8× or worse.
 * - Anything wider is not gated at all.
 *
 * Both margins carry a measured, systematic offset on top of each scenario's own noise. The
 * baseline is recorded by a standalone script in a fresh process; the gate runs as one test among
 * ~480 others, in a process whose heap is already large and fragmented by everything that ran
 * before it. Measured across all 59 scenarios, the same code in the shared process comes in at a
 * median 96% of its standalone throughput, with a 10th percentile of 81% and a worst case of 69%
 * of the recorded baseline. A margin tuned only to run-to-run noise would sit above that tail and
 * fail on a healthy machine roughly one run in three — which is what the tighter 25%/40% margins
 * these replace actually did.
 *
 * Floors are additionally scaled by how fast the machine running them is RIGHT NOW, measured in
 * the same run — see {@linkcode CALIBRATION_KEYS} and {@linkcode speedFactor}. Without that, the
 * gate is really asserting "this machine is as fast as the one the baselines came from", which is
 * a property of the build agent, not of the code: verified on a machine under heavy external load,
 * the sub-microsecond `context:*` scenarios came in 2–3× below their floors, run after run, with
 * no code change involved at all. The scaling only ever relaxes a floor, never tightens one, and
 * it is derived exclusively from scenarios containing no `@zanix/server` code — so a real
 * regression cannot hide inside it.
 *
 * So this gate is a **coarse instrument, on purpose**: it will not notice a 10% slowdown, and it is
 * not meant to. It exists to catch the class of regression that actually happens — an accidental
 * O(n²), a lost fast path, an extra full serialization pass — while never failing because a CI
 * runner was busy. The `deno bench` suite, not this test, is where fine-grained comparison lives.
 *
 * ### Why some scenarios are measured but never gated
 *
 * See {@linkcode RATIONALES}. Four reasons, all of them the same underlying rule: a threshold is
 * only honest when the number it thresholds is a stable measurement OF THIS PACKAGE'S CODE. A
 * scenario that measures a Deno primitive, or that is mostly harness overhead, or whose spread is
 * wider than the regression it would catch, gets no threshold — it stays informational, and its
 * number is still printed on every gate run.
 *
 * ### Re-recording
 *
 * Run `deno task bench:baseline` twice on an idle machine, combine as described above, and update
 * both the numbers AND the `mode`/`margin` decisions — a scenario that became stable can be
 * promoted to a gate, and one that became noisy must be demoted. Never edit a number to make a
 * failing gate pass without stating why in this file.
 *
 * @module
 */

/** Why a scenario is, or is not, a regression gate. */
export type GateRationale =
  | 'stable'
  | 'moderateSpread'
  | 'wideSpread'
  | 'harnessFloor'
  | 'runtimePrimitive'
  | 'deterministicElsewhere'
  | 'thirdPartyDependency'
  | 'pendingBaseline'
  | 'inSuiteMargin'
  | 'inSuiteUnstable'

/** The full reasoning behind each {@linkcode GateRationale}, kept in one place rather than
 * repeated on all 59 entries. */
export const RATIONALES: Record<GateRationale, string> = {
  stable: 'Spread across ten runs stayed within 15% of the baseline, so a 25% margin sits ' +
    'comfortably below normal noise while still catching a ~1.35× regression.',
  moderateSpread: 'Spread across ten runs reached 15–30%, so the margin is widened to 40%. The ' +
    'floor still catches a ~1.7× regression, which is the size of the regressions this gate ' +
    'exists for.',
  wideSpread: 'Spread across ten runs exceeded 30% — wider than most regressions worth catching. ' +
    'Thresholding it would either fire on noise or sit so low it protects nothing, so it is ' +
    'reported and not gated.',
  harnessFloor: 'A large share of this measurement is the benchmark harness constructing a ' +
    "Request, not @zanix/server doing work (see `makeRequest`'s own doc: a body can only be read " +
    "once, so these scenarios cannot hoist it out). Gating it would mostly gate Deno's Headers " +
    'implementation. The same operation IS gated at the large payload size, where construction ' +
    'falls to about 1% of the total.',
  runtimePrimitive: 'A control scenario: it measures a Deno/WHATWG primitive on purpose, so the ' +
    'other numbers can be read in proportion to it. There is no @zanix/server code in it to ' +
    'regress.',
  inSuiteMargin: 'Gated at the wider margin, on evidence from the environment the gate actually ' +
    "runs in. Across fifteen clean full-suite runs with no regression present, this scenario's " +
    'worst measurement landed at 66-73% of what the machine-speed calibration predicted for it — ' +
    'not enough headroom over the tight margin to survive an unlucky run. The standalone recording ' +
    'session is the weaker evidence here, because the gate never runs in a fresh process.\n' +
    'Margins are assigned by one rule, applied once over those fifteen runs rather than scenario ' +
    'by scenario: a gate must keep at least 15% headroom over its floor in the worst run observed. ' +
    'A scenario needing no more than a 35% margin to clear that keeps it; one needing up to 45% ' +
    'gets 45%; one needing more is not gated at all.',
  inSuiteUnstable:
    'Measured and reported, never gated. Across fifteen clean full-suite runs with ' +
    "no regression present, this scenario's worst measurement landed at 54-61% of what the " +
    'machine-speed calibration predicted — it would need a margin above 45% to stop producing ' +
    'false positives, and a floor that low protects less than the noise it is absorbing. ' +
    'Sub-microsecond, allocation-sensitive scenarios degrade in a shared, fragmented heap far more ' +
    'than the native-heavy control scenarios the calibration is derived from, so the calibration ' +
    'under-corrects for exactly this shape.',
  thirdPartyDependency: 'A control scenario for a third-party dependency: it measures ' +
    '`graphql-js` on purpose, so the GraphQL request numbers can be read in proportion to it. It ' +
    'moves when the `graphql` dependency moves, not when this package changes, so gating it ' +
    'would turn a dependency bump into a failed build of this package.',
  pendingBaseline: 'Measured and reported, but not yet gated: its baseline was recorded in a ' +
    'session where the machine benchmarked at ~40% of the throughput the other 59 scenarios were ' +
    'recorded at (the same code, re-measured on the same machine under external load). Those ' +
    'numbers are real measurements, but they are not a reference anyone should threshold ' +
    'against — and comparing them against the other rows in this table would be meaningless. ' +
    'Re-record on an idle machine, then promote using the same drop-based rule as every other ' +
    'entry.',
  deterministicElsewhere: 'The property this scenario exists to protect — that the response ' +
    'really streams instead of being buffered — is asserted EXACTLY, as a source-chunk count, by ' +
    'the validity gate in `validity.ts`. That check cannot be fooled by noise, so the timing here ' +
    'is kept purely as a quantification of the same fact.',
}

/** One recorded baseline. */
export interface BaselineEntry {
  /** What this metric protects, in words — printed on failure so the reader knows what broke. */
  metric: string
  /** Recorded throughput, in operations per second. See this module's doc for how it was derived. */
  baseline: number
  /** The slowest run observed across the ten recording runs, in operations per second. */
  worstObserved: number
  /** How far below `baseline` that slowest run fell, as a percentage — the observed variability. */
  observedDropPercent: number
  /** The widest within-run coefficient of variation observed, as a percentage. */
  maxCvPercent: number
  /** Regression margin applied to `baseline`. `null` for a scenario that is not gated. */
  margin: number | null
  /** Whether this scenario is a regression gate or an informational benchmark. */
  mode: 'gate' | 'informational'
  /** Why — see {@linkcode RATIONALES}. */
  rationale: GateRationale
}

/** What each metric protects, in words — printed on failure so the reader knows what broke. Kept
 * as its own table so {@linkcode RECORDED} below stays readable as an actual table of numbers. */
const METRICS: Record<string, string> = {
  'context:als:runWith': 'per-request AsyncLocalStorage scope cost when enableALS is on',
  'context:body:json:large': 'JSON body parsing throughput at 1000 items',
  'context:body:json:medium': 'JSON body parsing throughput at 50 items',
  'context:body:json:small': 'JSON body parsing throughput at 1 item',
  'context:body:none': 'the no-body fast path every GET/DELETE/HEAD request takes',
  'context:control:request-construct': 'Deno Request construction (the suite’s own harness floor)',
  'context:control:request-construct-body':
    'Deno Request construction with a body (harness floor for body scenarios)',
  'context:control:url-parse':
    'WHATWG URL parsing (the runtime primitive getMainHandler starts from)',
  'context:cookies:guard': 'cookie parsing plus X-Znx- filtering, on every request',
  'context:id': 'per-request context id generation, on every request',
  'context:params:accessor': 'lazy route-param extraction on first access',
  'context:prefix': 'multiplexer path-prefix extraction, on every shared-port request',
  'context:search:lazy': 'lazy query-string accessor on first access',
  'lifecycle:absolute': 'the whole request lifecycle for a static route — the runtime’s floor',
  'lifecycle:catchall': 'the whole request lifecycle for a catch-all route',
  'lifecycle:control:request-construct-body':
    'Deno Request construction with a body (harness floor for lifecycle JSON)',
  'lifecycle:json:large': 'the whole request lifecycle with a 1000-item JSON body in and out',
  'lifecycle:json:medium': 'the whole request lifecycle with a 50-item JSON body in and out',
  'lifecycle:json:small': 'the whole request lifecycle with a 1-item JSON body in and out',
  'lifecycle:middleware3':
    'the whole request lifecycle through 3 guards, 2 pipes and 2 interceptors',
  'lifecycle:multiplexer': 'shared-port dispatch plus the whole request lifecycle',
  'lifecycle:notfound': 'the unmatched-path (404) rejection path',
  'lifecycle:param': 'the whole request lifecycle for a :param route',
  'lifecycle:param:table:large': 'dispatch to the last of 200 :param routes — how routing scales',
  'lifecycle:param:table:medium': 'dispatch to the last of 50 :param routes — how routing scales',
  'lifecycle:param:table:small': 'dispatch to the last of 5 :param routes — how routing scales',
  'middleware:cors:preflight': 'the CORS preflight short-circuit',
  'middleware:cors:simple': 'the CORS guard on a cross-origin request',
  'middleware:guard:custom3': 'the guard phase with 3 application guards declared',
  'middleware:guard:default': 'the guard phase with only the built-in CORS + cookies guards',
  'middleware:interceptor:custom3':
    'the interceptor phase with 3 application interceptors declared',
  'middleware:interceptor:default': 'the interceptor phase: handler, header merge and cleanup',
  'middleware:pipe:custom3':
    'the pipe phase with 3 application pipes declared (not gated — but middleware:pipe:default, ' +
    'the framework half of the same phase, is)',
  'middleware:pipe:default': 'the pipe phase: scoped-context registration only',
  'middleware:response-interceptor': 'handler result to Response conversion',
  'response:error:http': 'building an HTTP error Response',
  'response:error:serialize': 'serializing an error to its JSON wire form',
  'response:gzip:from-response:medium':
    'buffered gzip compression throughput for a REST/GraphQL response',
  'response:gzip:medium': 'gzip compression throughput from a JSON string body',
  'response:handler:response': 'the pass-through path when a handler already returns a Response',
  'response:handler:string': 'the string path when a handler returns plain text',
  'response:health:liveness': 'the /health liveness response',
  'response:health:readiness': 'the /ready readiness aggregation with 3 checks',
  'response:json:large': 'JSON response serialization at 1000 items',
  'response:json:medium': 'JSON response serialization at 50 items',
  'response:json:small': 'JSON response serialization at 1 item',
  'response:stream:ttfb:buffered':
    'time to first byte through the BUFFERING compressor (must stay slow)',
  'response:stream:ttfb:gzip':
    'time to first byte of a streamed SSR response through gzipStreamingResponse',
  'response:stream:ttfb:plain': 'time to first byte of a streamed SSR response with no compression',
  'routing:compile:large': 'boot-time route-table compilation at 200 routes',
  'routing:compile:medium': 'boot-time route-table compilation at 50 routes',
  'routing:compile:small': 'boot-time route-table compilation at 5 routes',
  'routing:getParamNames': 'route param-name extraction at compile time',
  'routing:match:catchall': 'catch-all route matching',
  'routing:match:hit:large':
    'worst-case :param route matching over a 200-route table (not gated — but the same scaling ' +
    'property is still gated end to end by lifecycle:param:table:large)',
  'routing:match:hit:medium': 'worst-case :param route matching over a 50-route table',
  'routing:match:hit:small': 'worst-case :param route matching over a 5-route table',
  'routing:match:miss:large': 'full-scan route miss over a 200-route table (the 404 path)',
  'routing:pathToRegex': 'route-pattern regex compilation',
  'routing:match:hit:mixed:medium':
    'worst-case route matching over 50 routes across 5 HTTP methods',
  'routing:match:hit:mixed:large':
    'worst-case route matching over 200 routes across 5 HTTP methods',
  'routing:match:miss:mixed:large': 'a route miss over 200 routes across 5 HTTP methods',
  'lifecycle:param:mixed:large': 'the whole request lifecycle against a 200-route, 5-method table',
  'graphql:control:parse': 'graphql-js parse() of a query (the dependency, not @zanix/server)',
  'graphql:request:items:large': 'the GraphQL request path returning 1000 items',
  'graphql:request:items:medium': 'the GraphQL request path returning 50 items',
  'graphql:request:items:small': 'the GraphQL request path returning 1 item',
  'graphql:request:mutation': 'the GraphQL request path for a mutation with variables',
  'graphql:request:ping': 'the GraphQL request path for a trivial scalar query',
  'graphql:schema:build': 'boot-time GraphQL schema assembly for one Application',
  'sockets:message:no-reply': 'a socket message whose handler replies with nothing',
  'sockets:message:reply:large': 'serializing and sending a 1000-item socket reply frame',
  'sockets:message:reply:medium': 'serializing and sending a 50-item socket reply frame',
  'sockets:message:reply:small': 'serializing and sending a 1-item socket reply frame',
  'sockets:reject:non-upgrade': 'rejecting a non-WebSocket request on a socket route',
}

/** The recorded measurements, one row per scenario:
 * `[baseline, worstObserved, observedDropPercent, maxCvPercent, margin, rationale]`, with a
 * `null` margin meaning "measured but not gated". See this module's own doc for how each number
 * was derived and why each margin is what it is. */
const RECORDED: Record<
  string,
  [number, number, number, number, number | null, GateRationale]
> = {
  'context:als:runWith': [4940000, 4560000, 7.7, 29.6, 0.45, 'inSuiteMargin'],
  'context:body:json:large': [3500, 3200, 8.6, 28.5, 0.35, 'stable'],
  'context:body:json:medium': [56900, 52700, 7.4, 26.8, null, 'harnessFloor'],
  'context:body:json:small': [262700, 228200, 13.1, 66.3, null, 'harnessFloor'],
  'context:body:none': [31690000, 30750000, 3.0, 38.4, 0.45, 'inSuiteMargin'],
  'context:control:request-construct': [355900, 253100, 28.9, 90.0, null, 'runtimePrimitive'],
  'context:control:request-construct-body': [354600, 345200, 2.7, 27.7, null, 'runtimePrimitive'],
  'context:control:url-parse': [2980000, 2820000, 5.4, 98.3, null, 'runtimePrimitive'],
  'context:cookies:guard': [1410000, 1360000, 3.5, 24.1, 0.45, 'inSuiteMargin'],
  'context:id': [18320000, 18050000, 1.5, 40.0, 0.35, 'stable'],
  'context:params:accessor': [2750000, 2630000, 4.4, 68.1, null, 'inSuiteUnstable'],
  'context:prefix': [3010000, 2830000, 6.0, 46.7, 0.35, 'stable'],
  'context:search:lazy': [857300, 823200, 4.0, 25.1, 0.35, 'stable'],
  'lifecycle:absolute': [46600, 43600, 6.4, 68.8, 0.35, 'stable'],
  'lifecycle:catchall': [43800, 39300, 10.3, 53.2, 0.35, 'stable'],
  'lifecycle:control:request-construct-body': [342600, 312400, 8.8, 22.5, null, 'runtimePrimitive'],
  'lifecycle:json:large': [3200, 2900, 9.4, 14.1, 0.35, 'stable'],
  'lifecycle:json:medium': [25000, 23100, 7.6, 30.3, 0.35, 'stable'],
  'lifecycle:json:small': [39500, 37000, 6.3, 25.2, 0.35, 'stable'],
  'lifecycle:middleware3': [31100, 29800, 4.2, 30.3, 0.45, 'inSuiteMargin'],
  'lifecycle:multiplexer': [47400, 42100, 11.2, 28.5, 0.35, 'stable'],
  'lifecycle:notfound': [303500, 254700, 16.1, 70.3, 0.35, 'moderateSpread'],
  'lifecycle:param': [43800, 40700, 7.1, 21.0, 0.35, 'stable'],
  'lifecycle:param:table:large': [27500, 24500, 10.9, 32.6, 0.45, 'inSuiteMargin'],
  'lifecycle:param:table:medium': [40800, 37500, 8.1, 40.7, null, 'inSuiteUnstable'],
  'lifecycle:param:table:small': [46100, 37900, 17.8, 27.3, 0.45, 'inSuiteMargin'],
  'middleware:cors:preflight': [4450000, 4130000, 7.2, 68.2, 0.35, 'stable'],
  'middleware:cors:simple': [3380000, 3190000, 5.6, 10.2, 0.35, 'stable'],
  'middleware:guard:custom3': [281400, 271200, 3.6, 15.6, 0.35, 'stable'],
  'middleware:guard:default': [386300, 363400, 5.9, 12.0, 0.45, 'inSuiteMargin'],
  'middleware:interceptor:custom3': [145900, 133800, 8.3, 32.3, 0.45, 'inSuiteMargin'],
  'middleware:interceptor:default': [277800, 268800, 3.2, 12.3, 0.45, 'inSuiteMargin'],
  'middleware:pipe:custom3': [1440000, 673800, 53.2, 67.2, null, 'wideSpread'],
  'middleware:pipe:default': [1960000, 1840000, 6.1, 35.9, 0.35, 'stable'],
  'middleware:response-interceptor': [2900000, 2870000, 1.0, 7.3, 0.35, 'stable'],
  'response:error:http': [339400, 329200, 3.0, 31.6, 0.35, 'stable'],
  'response:error:serialize': [429800, 419700, 2.3, 10.1, 0.35, 'stable'],
  'response:gzip:from-response:medium': [309100, 295700, 4.3, 29.7, 0.45, 'inSuiteMargin'],
  'response:gzip:medium': [30100, 25200, 16.3, 51.0, null, 'inSuiteUnstable'],
  'response:handler:response': [5640000, 5390000, 4.4, 11.0, 0.35, 'stable'],
  'response:handler:string': [7560000, 7440000, 1.6, 25.1, 0.35, 'stable'],
  'response:health:liveness': [7360000, 6990000, 5.0, 27.2, 0.35, 'stable'],
  'response:health:readiness': [469700, 446100, 5.0, 27.8, 0.45, 'inSuiteMargin'],
  'response:json:large': [13200, 12300, 6.8, 43.4, 0.35, 'stable'],
  'response:json:medium': [244900, 221600, 9.5, 144.6, 0.35, 'stable'],
  'response:json:small': [2880000, 2790000, 3.1, 6.4, 0.45, 'inSuiteMargin'],
  'response:stream:ttfb:buffered': [10900, 10100, 7.3, 14.6, null, 'deterministicElsewhere'],
  'response:stream:ttfb:gzip': [28700, 26900, 6.3, 21.3, null, 'deterministicElsewhere'],
  'response:stream:ttfb:plain': [946700, 924800, 2.3, 28.4, null, 'deterministicElsewhere'],
  'routing:compile:large': [75, 74, 2.1, 24.9, 0.35, 'stable'],
  'routing:compile:medium': [307, 276, 10.2, 26.7, 0.35, 'stable'],
  'routing:compile:small': [3100, 2800, 9.7, 17.6, 0.35, 'stable'],
  'routing:getParamNames': [4480000, 3810000, 15.0, 65.5, 0.45, 'inSuiteMargin'],
  'routing:match:catchall': [7770000, 5490000, 29.3, 67.7, 0.35, 'moderateSpread'],
  'routing:match:hit:large': [96000, 45900, 52.2, 67.7, null, 'wideSpread'],
  'routing:match:hit:medium': [513600, 499500, 2.7, 30.0, 0.35, 'stable'],
  'routing:match:hit:small': [4890000, 4780000, 2.2, 17.9, 0.35, 'stable'],
  'routing:match:miss:large': [144200, 101400, 29.7, 56.7, 0.45, 'inSuiteMargin'],
  'graphql:control:parse': [257300, 153700, 40.3, 66.4, null, 'pendingBaseline'],
  'graphql:request:items:large': [3100, 3000, 3.2, 26.5, null, 'pendingBaseline'],
  'graphql:request:items:medium': [31600, 31200, 1.3, 38.8, null, 'pendingBaseline'],
  'graphql:request:items:small': [81600, 66700, 18.3, 49.5, null, 'pendingBaseline'],
  'graphql:request:mutation': [95500, 75900, 20.5, 47.2, null, 'pendingBaseline'],
  'graphql:request:ping': [210200, 146700, 30.2, 39.1, null, 'pendingBaseline'],
  'graphql:schema:build': [4200, 3200, 23.8, 30.8, null, 'pendingBaseline'],
  'sockets:message:no-reply': [44940000, 29030000, 35.4, 13.5, null, 'pendingBaseline'],
  'sockets:message:reply:large': [5500, 4600, 16.4, 107.1, null, 'pendingBaseline'],
  'sockets:message:reply:medium': [120100, 96300, 19.8, 17.1, null, 'pendingBaseline'],
  'sockets:message:reply:small': [3040000, 1790000, 41.1, 15.0, null, 'pendingBaseline'],
  'sockets:reject:non-upgrade': [148400, 76500, 48.5, 20.0, null, 'pendingBaseline'],
  'routing:match:hit:mixed:medium': [2247971, 1733076, 22.9, 0.0, null, 'pendingBaseline'],
  'routing:match:hit:mixed:large': [407606, 304623, 25.3, 0.0, null, 'pendingBaseline'],
  'routing:match:miss:mixed:large': [520253, 309220, 40.6, 0.0, null, 'pendingBaseline'],
  'lifecycle:param:mixed:large': [24389, 17242, 29.3, 0.0, null, 'pendingBaseline'],
  'routing:pathToRegex': [3420000, 2910000, 14.9, 58.6, 0.35, 'stable'],
}

/**
 * Every measured scenario, keyed by its `Scenario.key`. Renaming a scenario key without
 * re-recording orphans its baseline — the gate reports that as a missing entry rather than
 * silently skipping it.
 */
export const BASELINES: Record<string, BaselineEntry> = Object.fromEntries(
  Object.entries(RECORDED).map((
    [key, [baseline, worstObserved, observedDropPercent, maxCvPercent, margin, rationale]],
  ) => [key, {
    metric: METRICS[key],
    baseline,
    worstObserved,
    observedDropPercent,
    maxCvPercent,
    margin,
    mode: margin === null ? 'informational' : 'gate',
    rationale,
  }]),
)

/** How many scenarios this file records. */
export const SCENARIO_COUNT: number = Object.keys(BASELINES).length

/**
 * The scenarios whose measured-vs-recorded ratio tells the gate how fast THIS machine is right now.
 *
 * All four are `control:` scenarios — they measure a Deno/WHATWG primitive (`new Request()`,
 * `new URL()`) and contain no `@zanix/server` code at all. That is exactly what makes them usable
 * as a speed reference: no change to this package can move them, so scaling the floors by how far
 * they have drifted can relax a floor for a slow machine without ever masking a real regression.
 */
export const CALIBRATION_KEYS: readonly string[] = [
  'context:control:request-construct',
  'context:control:request-construct-body',
  'context:control:url-parse',
  'lifecycle:control:request-construct-body',
]

/**
 * The machine-speed factor below which the gate warns that its verdict is less trustworthy.
 *
 * It does NOT stop the gate from judging. An earlier version returned early here, which turned
 * "this machine is slow" into "everything passed" — measured, that silently absolved a simulated
 * 3× regression on one run in three. The floors are scaled by the measured speed either way, and
 * that scaling keeps discriminating well below this mark, so the verdict stands and only its
 * confidence is qualified. `ZANIX_PERF_GATE=off` is the deliberate escape hatch.
 */
export const MIN_SPEED_FACTOR = 0.35

/**
 * The measured speed of this machine relative to the one the baselines were recorded on, as the
 * median of {@linkcode CALIBRATION_KEYS}' measured-over-recorded ratios.
 *
 * Clamped to at most `1`: a machine that is FASTER than the reference gets the recorded floors
 * unchanged, never stricter ones. Tightening a floor because a build agent happened to be idle
 * would turn a well-behaved change into a failure for no reason.
 */
export function speedFactor(ratios: number[]): number {
  if (!ratios.length) return 1
  const sorted = [...ratios].sort((a, b) => a - b)
  return Math.min(1, sorted[(sorted.length - 1) >> 1])
}

/**
 * The throughput a gated scenario must stay at or above. `Infinity` for a scenario that is not
 * gated, so a caller that forgets to check `mode` fails loudly rather than silently gating on 0.
 */
export function regressionFloor(entry: BaselineEntry, machineSpeed = 1): number {
  return entry.margin === null ? Infinity : entry.baseline * (1 - entry.margin) * machineSpeed
}
