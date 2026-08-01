import { AsyncContext } from 'modules/infra/base/storage.ts'

/** The Application every capability belongs to when no `ApplicationContainer.define` scope is active. */
export const DEFAULT_APPLICATION = 'main'

/**
 * Resolves which Application a capability (route, resolver, socket) currently being registered
 * belongs to — a composition-time-only concept, never consulted once a server actually activates.
 *
 * `define(name, setup)` runs `setup` with `name` as the ambient Application for anything it
 * registers; a capability (e.g. `RouteContainer.defineRoute`) reads `getCurrent()` the instant it
 * registers and persists that id onto its own metadata record as an ordinary, static field —
 * ownership becomes plain data at that exact moment. Nothing downstream (`routeProcessor`, a
 * server's own compiled dispatch table) ever calls back into this container; it exists purely to
 * resolve the *composition-time* question of "which Application is currently being assembled,"
 * including across genuinely concurrent composition batches (e.g. two `Promise.all`-parallel
 * `define` calls) — which is exactly why this is backed by `AsyncContext`
 * (`AsyncLocalStorage`-based) rather than a plain mutable variable: a flat variable would be
 * overwritten by whichever concurrent batch runs last, silently misattributing the other's
 * capabilities.
 */
export class ApplicationContainer {
  #context: AsyncContext = new AsyncContext({ name: 'zanix-application-context' })

  /**
   * Runs `setup` with `name` as the ambient Application for the duration of its (possibly
   * asynchronous) execution. Safe to nest/interleave with other `define` calls running
   * concurrently — each keeps its own ambient id, regardless of call order.
   */
  public async define(name: string, setup: () => void | Promise<void>): Promise<void> {
    await this.#context.runWith(name, async () => {
      await setup()
    })
  }

  /**
   * The ambient Application right now, or {@link DEFAULT_APPLICATION} if no `define` call is
   * currently active.
   */
  public getCurrent(): string {
    return this.#context.getId() ?? DEFAULT_APPLICATION
  }
}
