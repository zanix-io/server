# Benchmarks & Performance Regression

How `@zanix/server`'s own backend runtime is measured, and how a significant slowdown is caught
before it ships. This is contributor documentation: the suite lives under `src/@tests/`, which is
excluded from the published package, and nothing here is part of the public API.

Two layers over one set of scenario definitions.

| Layer             | Where                                 | What it does                                                               | Thresholds?           |
| ----------------- | ------------------------------------- | -------------------------------------------------------------------------- | --------------------- |
| Benchmark         | `src/@tests/benchmarks/**/*.bench.ts` | `Deno.bench` baseline evidence, comparable across versions                 | none, by design       |
| Regression gate   | `src/@tests/performance/`             | fails `deno test` on a significant slowdown                                | yes, from measurement |
| Benchmark (heavy) | `deno task bench:baseline`            | the same evidence for the 15 scenarios `Deno.bench` cannot run — see below | none, by design       |

```sh
deno task bench            # all benchmarks (deno bench)
deno task test:perf        # the regression gate only
deno task bench:baseline   # re-measure and print a paste-ready baseline table
```

## In-process only, by construction

The suite depends on nothing outside this package and its own runtime: no socket, no filesystem, no
database, no external service. `getMainHandler` returns a plain `(Request) => Promise<Response>`, so
the entire request lifecycle is measured as a direct in-process call — no `Deno.serve`, no port, no
kernel involvement.

That is the whole point: a number here can only move when this package's own code moves. Anything
that would make a measurement depend on something else does not belong in it.

## A `Deno.bench` limitation worth knowing about

`deno task bench` runs **one bench file per process**, and 15 of the 71 scenarios — every
full-request-lifecycle one, plus the largest JSON payloads — are excluded from the `Deno.bench`
layer entirely (`Scenario.skipDenoBench`).

Neither is a preference. `Deno.bench`'s harness in Deno 2.9.5 accumulates across benchmarks within a
process and, for an asynchronous benchmark that allocates a large object graph per iteration,
ignores the `n`/`warmup` hints and grows until the V8 heap is gone: measured at a 32 GB peak
footprint, `Fatal JavaScript out of memory`, and no table at all. The same scenarios run 100,000
iterations each through this suite's own sampler in ~164 MB.

Those 15 scenarios lose their `deno bench` row, not their coverage. The regression gate measures,
thresholds and reports every one of them, and `deno task bench:baseline` prints them all as a table.
Re-test both workarounds when upgrading Deno.

## Scenarios are defined once

`scenarios/{context,routing,middleware,response,lifecycle,graphql,sockets}.ts` each export a factory
returning `Scenario[]`. The `*.bench.ts` files register them with `Deno.bench`; the regression gate
times the identical `run` functions through its own sampler. Neither layer owns a second copy of a
scenario, so the gate cannot drift away from what the benchmark measures.

Factories, not module-level constants: building a scenario compiles route tables through the
process-global route registry, and the gate runs inside the shared `deno test` process. Importing
these modules therefore has no side effects at all; the work happens only when a factory is called.

## What is measured

- **Request/context setup** — context id, body parsing (3 sizes), lazy query/param accessors, cookie
  parsing and filtering, the ALS scope `enableALS` opens per request.
- **Routing** — boot-time table compilation and per-request matching, both at 5/50/200 routes, plus
  catch-all matching and the full-scan miss the 404 path takes. Measured against BOTH shapes: an
  all-`GET` table and one spread across five HTTP methods. Only the second can show whether the scan
  is wasting work on routes the request's method could never match, and keeping both means a routing
  change has to prove it helps there without hurting the single-method case.
- **Middleware** — guard, pipe and interceptor phases, each with zero and with three declared
  middlewares, so a regression is attributable to the framework or to per-middleware dispatch.
- **Response** — handler-result conversion (string / `Response` / JSON at 3 sizes), error responses,
  gzip throughput, health endpoints, and streaming-SSR time-to-first-byte.
- **Full lifecycle** — `Request` in, `Response` out, for static / `:param` / catch-all / 404 /
  multiplexed / middleware-heavy / JSON-body routes.
- **GraphQL** — schema assembly for one Application, and the request handler for a scalar query, a
  mutation, and list queries at three sizes. `graphql-js`' own `parse` is measured separately as a
  control, so a dependency bump is never mistaken for a regression in this package.
- **WebSockets** — the per-message reply path (the wrapper `ZanixWebSocket`'s constructor installs:
  serialize the handler's result, send the frame) at three payload sizes, plus the non-upgrade
  rejection path.

Not measured, deliberately: the validation pipe (measures `@zanix/validator`), and anything that
binds a port — including the WebSocket **upgrade** handshake, which needs a real hijackable
connection from `Deno.serve`; reaching it would measure the kernel's socket path rather than this
package. That handshake stays covered functionally, by `src/@tests/functional/sockets.test.ts`.

## Three traps this suite is built around

**1. Harness floor.** `new Request()` costs 5–11 µs here, almost all of it `new Headers()` — one to
two orders of magnitude more than most operations measured. Every scenario builds its request
outside the timed region; the only exceptions are the ones that consume a body (which can be read
only once). Those are paired with an explicit `control:` scenario measuring construction alone, and
are gated only where construction falls to ~1% of the total.

**2. A benchmark that stops doing its job gets faster, not slower.** A route that no longer matches
turns a dispatch scenario into a cheap 404. A body that no longer parses returns early through
`bodyPayloadProperty`'s own `catch`. `src/@tests/performance/validity.ts` asserts a deterministic
property of each scenario's own return value — a status code, a parsed field, a source-chunk count —
before any timing is trusted.

**3. Deterministic and noisy are different kinds of evidence.** Chunk counts and status codes are
asserted exactly. Timings are thresholded loosely, or not at all. The streaming time-to-first-byte
scenarios are the clearest case: the property they exist to protect (`gzipStreamingResponse`
streams, `gzipResponseFromResponse` buffers) is gated as an exact chunk count, and their timings
stay informational.

See `src/@tests/performance/baseline.ts` for every recorded number, every margin and the reason
behind each one.

## What the suite has already found

A record of the optimization round the suite paid for, including the hypotheses that turned out to
be wrong. The negative results are the more useful half: each one is a change somebody would
otherwise try again.

### Optimized

**Route matching scanned routes the request's method could never match.** A route's storage key —
and therefore its compiled regex — ends in its own method suffix, and `findMatchingRoute` is a
linear scan, so a `GET` ran the regex of every `POST`/`PUT`/`PATCH`/`DELETE` route before reaching
its own. `getMainHandler` now buckets both `:param` tables by method once, at construction time
(`bucketRoutesByMethod`). Measured with both variants interleaved in one process: **1.79x** end to
end on a 50-route/5-method table, **2.37x** on a 200-route/5-method one, **4.84–6.42x** on matching
alone, and within noise (one extra property lookup) on a single-method table.

**The middleware phases awaited their own middleware functions.** `mainGuard` and `mainInterceptor`
iterated an array of FUNCTIONS with `for await`, which awaits each ELEMENT before calling it — a
microtask tick spent awaiting a function — and then awaited the result unconditionally, ticking
again even though both built-in guards are synchronous. An indexed loop that awaits only what is
thenable gives **1.23x** with the built-in guards alone, **1.36x** with three application guards,
and **1.21x** on the interceptor phase with three interceptors.

### Measured and refuted

| Hypothesis                                                                                 | Measured                              | Verdict                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------- |
| `new Headers()` per request is worth avoiding in `mainGuard`                               | 0.040 µs                              | Negligible — 1.7% of the phase                     |
| Building the three `interactors`/`providers`/`connectors` getters per request is expensive | 0.007 µs                              | V8 optimizes them away; there is no cost to remove |
| Making those getters lazy via `Object.defineProperties` would help                         | 1.181 µs                              | **30x worse than what it replaces**                |
| The `'d'` (`hasIndices`) flag `pathToRegex` always adds costs something per match          | 20.14M exec/s with it, 20.14M without | Free — V8 computes indices lazily                  |

### Measured and deliberately left alone

The request lifecycle looked like it had a large unattributed cost: the phases sum to ~7 µs while a
full request measures ~21 µs. Profiling every per-request allocation found **1.22 µs** total —
`new URL` 0.286, the lazy `search` descriptor 0.529, `cleanRoute` 0.150, `contextId` 0.086, the body
`await` 0.098, `Object.assign` 0.047, the context literal 0.013. The rest is the promise chain
through the phases themselves, not a discrete thing to remove.

The two candidates that remained — returning the no-body fast path synchronously (0.092 µs) and
assigning `payload.body` directly instead of via `Object.assign` (0.033 µs) — total **0.6% of a
request**, against a measurement noise floor of 5–10% on the lifecycle scenarios. They were not
implemented, because their benefit could not have been demonstrated. Both would also have cost
either a duplicated method check or a new shared helper.

The lesson generalizes: a gap between "the phases sum to X" and "the whole thing costs Y" is not
evidence of waste. The phases are measured in isolation with a reused context and a hot loop, which
is optimistic by construction.

## See also

- [Utilities Reference](./utilities.md) — the routing and compression helpers several of these
  scenarios measure directly.
- [Middlewares](./middlewares.md) — the guard/pipe/interceptor pipeline whose phases are measured
  with zero and with three declared middlewares.
- [Error Handling](./errors.md) — the error-serialization path behind the `response:error:*`
  scenarios.
