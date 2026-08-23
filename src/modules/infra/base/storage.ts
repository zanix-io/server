import type { BaseContext } from 'typings/context.ts'

import { AsyncLocalStorage, type AsyncLocalStorageOptions } from 'async_hooks'

/**
 * A class that extends `AsyncLocalStorage` to manage the context of a request asynchronously.
 * This class provides a method to retrieve the context ID and an `runWith` method
 * to execute a callback within a specific context.
 *
 * ### Not a Deno-native API — a real, tracked dependency on Deno's Node compatibility layer
 *
 * `AsyncLocalStorage` here comes from `node:async_hooks` (this package's `async_hooks` import
 * specifier maps to it), not from anything under `Deno.*`. There is currently no Deno-native
 * alternative: the language-level successor, the TC39 `AsyncContext` proposal
 * (https://github.com/tc39/proposal-async-context), is at Stage 2 as of writing — no engine,
 * including Deno's own V8, ships it. `node:async_hooks`'s `AsyncLocalStorage` is the only
 * production-viable async-context-propagation primitive Deno currently offers.
 *
 * Deno's own docs (https://docs.deno.com/api/node/async_hooks/) single this API out as "fully
 * implemented" with "significant optimizations" — while explicitly calling the REST of
 * `async_hooks` (`AsyncResource`, `createHook`, `executionAsyncId`, ...) "non-functional stubs"
 * and discouraging their use entirely. So this specific choice is the one Deno itself endorses.
 *
 * That said, it is not yet as battle-hardened as Node's decade-old implementation: Deno's own
 * issue tracker has recent, real correctness bugs specifically about context propagation across
 * concurrent/interleaved async work — e.g. `denoland/deno#35154` (context lost across `node:net`
 * callbacks, fixed by `#35237`, merged 2026-06-15) and `denoland/deno#36464` (context preserved
 * incorrectly after an exited scope, opened 2026-08-06, still in progress at the time this was
 * written). Anything in this codebase relying on this class for genuinely concurrent/interleaved
 * async chains — not just simple, non-overlapping request handling — is exercising exactly the
 * class of scenario those issues are about.
 *
 * ### `enableALS`'s default — resolved, with real numbers, not left as a hunch
 *
 * The observability audit's own open question ("does defaulting `enableALS` to `true` cost too
 * much?") is answered: it doesn't. `src/@tests/benchmarks/context.bench.ts`'s own
 * `context:als:runWith` scenario measures ~7.7µs average (p99 16.3µs) for one `runWith` scope per
 * request — cheaper than `contextId()`'s own UUID generation (~5.1µs), which every request already
 * pays unconditionally regardless of `enableALS`, and negligible next to the ~139µs the rest of
 * per-request context setup already costs before a handler even runs (let alone any real I/O
 * inside one). Performance is not the blocker.
 *
 * The blocker is the correctness caveat directly above: `denoland/deno#36464` is still open (a fix
 * PR exists, validated against Node's own reference behavior, not yet merged as of this writing).
 * Flipping `enableALS`'s default to `true` would put every consumer's request handling — not just
 * the ones that opted in — inside the exact class of concurrent/interleaved scenario that bug
 * affects. Today, only a consumer that explicitly sets `enableALS: true` knowingly accepts that
 * risk. **Decision: keep `enableALS` opt-in until `denoland/deno#36464` lands**, then revisit —
 * at that point the only remaining question is UX (default-on with an opt-out, vs. keeping it
 * opt-in), not performance or correctness. See `ApplicationContainer`'s and
 * `BootSessionContainer`'s own docs for where this matters most, and
 * `GenericHandlerOptions.enableALS`'s doc for the highest-concurrency consumer (one context per
 * concurrent request).
 *
 * Scoping semantics (unaffected by the above, just to be explicit): a context set via `runWith`
 * lives only for that call's own async continuation (its callback, plus everything it directly or
 * indirectly awaits/schedules) — never the whole process, and never "only during startup". It
 * disappears once that continuation fully settles, and never leaks into an unrelated, independent
 * `runWith` call, even one running concurrently.
 *
 * @template BaseContext The base type for the context.
 */
// deno-lint-ignore no-explicit-any
export class AsyncContext extends AsyncLocalStorage<BaseContext & Record<string, any>> {
  /** Creates the async context store, named `zanix-async-context` unless overridden. */
  constructor(options?: AsyncLocalStorageOptions) {
    super({ name: 'zanix-async-context', ...options })
  }

  /**
   * Retrieves the ID of the current context stored in the async storage.
   *
   * @returns {string | undefined} The ID of the current context, or `undefined` if no context exists.
   */
  public getId(): string | undefined {
    return this.getStore()?.id
  }

  /**
   * Executes a callback within a specific context, storing only the given context ID.
   * This method wraps around `AsyncLocalStorage.run`, providing a narrower abstraction
   * that only requires the context ID rather than a full `BaseContext` object.
   *
   * @param {BaseContext['id']} contextId The ID to set as the current context in the async storage.
   * @param {() => R} callback The callback function to execute with the provided context.
   *
   * @returns {R} The result of executing the callback.
   *
   * @template R The type of the result returned by the callback function.
   */
  public runWith<R>(contextId: BaseContext['id'], callback: () => R): R {
    return this.run<R>({ id: contextId }, callback)
  }
}

/**
 * Default singleton instance
 */
export const asyncContext: AsyncContext = new AsyncContext()
