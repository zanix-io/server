import { InternalError } from '@zanix/errors'

/** {@link createStartLifecycleGuard}'s own options. */
export type StartLifecycleGuardOptions = {
  /** The `start()` call's own name, for both thrown error messages — e.g. `'Zanix.start()'`. */
  startLabel: string
  /** The `stop()` call's own name, referenced by the "already running" error — e.g. `'Zanix.stop()'`. */
  stopLabel: string
  /** `meta.source` stamped on both thrown errors — e.g. `'zanix'` / `'zanix-admin'`. */
  source: string
  /**
   * Extra clause inserted into the reentry error, right before "instead of throwing." — e.g.
   * `` '(e.g. `admin` on the first call being dropped) ' `` (note the trailing space). Omit for no
   * extra clause.
   */
  overlapNote?: string
}

/** The guard object {@link createStartLifecycleGuard} returns. */
export type StartLifecycleGuard = {
  /**
   * Throws if a previous `start()` call in this process either overlaps this one (still in
   * flight) or already completed successfully without an intervening `stop()`; otherwise marks
   * this call as now in flight. Call synchronously, before any `await`, as the very first thing
   * `start()` does.
   */
  guardReentry: () => void
  /** Marks `start()` as having completed successfully — call once its boot sequence finishes. */
  markRunning: () => void
  /** Clears the in-flight flag — call in a `finally` wrapping the boot sequence, so a failed boot doesn't permanently lock out retries. */
  clearStarting: () => void
  /** Marks `start()` as no longer running — call as the literal first statement of `stop()`, before any of its own `await`s. */
  markStopped: () => void
}

/**
 * Builds a self-contained `isStarting`/`isRunning` reentry guard for a package's own `start()`/
 * `stop()` pair — shared by `@zanix/core`'s `Zanix.start()` and `@zanix/admin`'s
 * `ZanixAdminHub.start()`, which previously each hand-rolled an identical pair of module-level
 * booleans (with admin's own doc comment already noting it "mirrors `@zanix/core`'s own `isRunning`
 * flag" — the two packages were already hand-syncing a copy of the same logic).
 *
 * Guards two distinct races, both real and both observed in this monorepo's own test suite:
 * - **Overlap**: a second `start()` call issued before the first one (still in flight, no `await`
 *   in between) finishes — without this, options read from shared module state after an `await`
 *   could be silently overwritten by the second call before the first ever reads them back.
 * - **Already running**: a second `start()` call issued after a previous one already completed
 *   successfully, without an intervening `stop()` — without this, nothing stops a caller from
 *   ending up with two independent sets of servers registered against the same process-wide
 *   route/DI/discovery registries.
 *
 * Both cases fail loudly (throw `InternalError`, naming the problem) rather than trying to make
 * overlapping/repeated boots safe — the underlying registries are process-wide singletons with no
 * per-boot isolation.
 *
 * Four small, single-purpose methods on one object (not fused into e.g. one `finish()` call)
 * specifically because "mark running" and "clear starting" only ever run together on the success
 * path — a boot that *throws* must still clear the in-flight flag (via a `finally`) without ever
 * marking itself running; collapsing the two would silently change behavior on the failure path (a
 * failed boot would permanently lock out retries).
 *
 * @example
 * ```ts
 * const guard = createStartLifecycleGuard({
 *   startLabel: 'Zanix.start()',
 *   stopLabel: 'Zanix.stop()',
 *   source: 'zanix',
 * })
 *
 * export const start = async (options = {}) => {
 *   guard.guardReentry()
 *   try {
 *     await bootSequence(options)
 *     guard.markRunning()
 *   } finally {
 *     guard.clearStarting()
 *   }
 * }
 *
 * export const stop = async () => {
 *   guard.markStopped()
 *   await teardown()
 * }
 * ```
 */
export function createStartLifecycleGuard(
  options: StartLifecycleGuardOptions,
): StartLifecycleGuard {
  const { startLabel, stopLabel, source, overlapNote = '' } = options

  let isStarting = false
  let isRunning = false

  return {
    guardReentry(): void {
      if (isStarting) {
        throw new InternalError(
          `${startLabel} was called again before a previous call in this process finished. ` +
            'Await the first call before starting another — two overlapping boots share the ' +
            'same process-wide route/DI/discovery registries, so racing them corrupts state ' +
            `silently ${overlapNote}instead of throwing.`,
          { meta: { source, method: 'start' } },
        )
      }
      if (isRunning) {
        throw new InternalError(
          `${startLabel} was called again while a previous call in this process is still ` +
            `running. Call ${stopLabel} first — a second boot would register a second, ` +
            'independent set of servers against the same process-wide route/DI/discovery ' +
            'registries as the first, without ever releasing them.',
          { meta: { source, method: 'start' } },
        )
      }
      isStarting = true
    },
    markRunning(): void {
      isRunning = true
    },
    clearStarting(): void {
      isStarting = false
    },
    markStopped(): void {
      isRunning = false
    },
  }
}
