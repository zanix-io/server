import { AsyncContext } from 'modules/infra/base/storage.ts'

/**
 * Tracks which Application names (see `ApplicationContainer`) are currently in use by each
 * still-in-flight "boot session" — one top-level `bootstrapServers()`-driven sequence (a single
 * `Zanix.start()` call, a single `ZanixAdminHub.start()` call, ...). Exists purely to scope
 * `finalize` cleanup (`InternalProgram.cleanupInitializationsMetadata`) so two independent,
 * temporally-overlapping sequences (no `await` between them) never wipe each other's not-yet-served
 * routes/discovery/resolver registrations.
 *
 * **Deliberately an exclude-list, not an include-list**: `finalize` cleanup asks "which
 * Applications does some OTHER, still-running session currently own?" (`getForeignActiveApplications`)
 * and sweeps everything NOT in that set — never "which Applications did MY OWN session touch?".
 * Most real registration (decorator evaluation via
 * `@Controller`/`@Resolver`, triggered by a plain `import()`) happens BEFORE any `bootstrapServers()`/
 * `runSession()` call ever starts, so an include-list would leave it untracked by every session and
 * `finalize` would silently stop clearing it at all — a real regression caught by
 * `graphql-scope-cleanup.test.ts`. The exclude-list only ever needs to know about OTHER sessions
 * that are genuinely concurrent right now; when none are, it's empty and cleanup falls back to
 * exactly the original, unscoped full wipe.
 *
 * Backed by `AsyncContext` (`AsyncLocalStorage`) for the same reason `ApplicationContainer` is — a
 * flat mutable variable would be overwritten by whichever concurrent sequence runs last, silently
 * misattributing the other's registrations. This class's own "two concurrent, interleaved
 * sessions" test exercises exactly the scenario `AsyncContext`'s doc flags as the one worth
 * watching (see that doc for the Deno-vs-Node-compat caveat) — `ApplicationContainer` relies on
 * the same guarantee but currently has no equivalent dedicated test of its own.
 */
export class BootSessionContainer {
  #context: AsyncContext = new AsyncContext({
    name: 'zanix-boot-session-context',
  })
  #activeSessions = new Map<string, Set<string>>()

  /**
   * Runs `setup` under a session id unique to this call — unless a session is ALREADY active (an
   * outer `runSession` call already wraps this one), in which case `setup` just reuses the ambient
   * session unchanged. `bootstrapServers()` always wraps its own body in this, so a bare call gets a
   * session of its own (today's implicit behavior, unchanged); a caller that wraps a WHOLE
   * multi-call sequence (`Zanix.start()`, `ZanixAdminHub.start()`) in one outer `runSession` makes
   * every `bootstrapServers()` call nested inside share that one session instead of forking its own
   * — this is what lets `finalize` cleanup on the LAST call of such a sequence still sweep an
   * Application an EARLIER call in the same sequence touched but never itself served (e.g. `'admin'`,
   * swept by the final `'main'`-serving call).
   */
  public async runSession<R>(setup: () => R | Promise<R>): Promise<R> {
    if (this.#context.getId()) return await setup()

    const id = crypto.randomUUID()
    this.#activeSessions.set(id, new Set())
    try {
      return await this.#context.runWith(id, async () => await setup())
    } finally {
      this.#activeSessions.delete(id)
    }
  }

  /**
   * Records that `application` is in use by the current session — called alongside every place
   * that already resolves `ApplicationContainer.getCurrent()` to tag a new route/discovery/resolver
   * entry. A no-op outside any `runSession` scope (nothing to attribute it to).
   */
  public recordApplication(application: string): void {
    const id = this.#context.getId()
    if (id) this.#activeSessions.get(id)?.add(application)
  }

  /**
   * Every Application currently in use by a DIFFERENT, still-in-flight session — excludes the
   * caller's own session (its own last call is allowed to sweep everything it itself touched) and
   * any session that has already fully exited (nothing left to protect once a sequence is done).
   * Empty whenever no other session is genuinely concurrent right now, which is the common case —
   * callers should fall back to an unscoped full wipe in that case, matching pre-session behavior
   * exactly.
   */
  public getForeignActiveApplications(): Set<string> {
    const ownId = this.#context.getId()
    const applications = new Set<string>()

    for (const [id, ownedApplications] of this.#activeSessions) {
      if (id === ownId) continue
      for (const application of ownedApplications) {
        applications.add(application)
      }
    }

    return applications
  }
}
