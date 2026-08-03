import type { DiscoveryRegistration } from 'typings/discovery.ts'

import { BaseContainer } from './base.ts'
import { InternalError } from '@zanix/errors'

/**
 * Registry of `DiscoveryRegistration`s, one bucket per Application, keyed by `resourceType` within
 * that bucket — mirrors `RouteContainer`, but stored as a nested `Map<application,
 * Map<resourceType, registration>>` rather than a single composite string key
 * (`` `${application}:${resourceType}` ``). `ApplicationContainer.define` places no restriction on
 * `name`'s charset, so a composite string key genuinely risks collision (an Application literally
 * named `'foo:bar'` colliding with a different `application`/`resourceType` split that happens to
 * concatenate to the same string) — `RouteContainer`'s own `` `${path}/${method}` `` composite key
 * gets away with this because paths/HTTP methods are already far more constrained in practice; that
 * same shortcut isn't equally safe for free-form Application names.
 */
export class DiscoveryContainer extends BaseContainer {
  #discoveryKey = 'discovery'

  /**
   * Registers `registration` under `resourceType` for `application` — a pure metadata write, the
   * same shape as `RouteContainer.defineRoute` recording `{path, handler, application}` without
   * compiling anything yet. Throws if `resourceType` is already registered for that `application`,
   * the same spirit as `RouteContainer`'s own duplicate-path guard.
   */
  public define(
    application: string,
    resourceType: string,
    registration: DiscoveryRegistration,
  ): void {
    const registry = this.getData<Map<string, Map<string, DiscoveryRegistration>>>(
      this.#discoveryKey,
    ) || new Map()

    let byResource = registry.get(application)
    if (!byResource) {
      byResource = new Map()
      registry.set(application, byResource)
    }

    if (byResource.has(resourceType)) {
      throw new InternalError(
        `Discovery resource "${resourceType}" is already defined for Application ` +
          `"${application}". Please ensure each resource is registered with a unique resourceType.`,
        { meta: { source: 'zanix', application, resourceType } },
      )
    }

    byResource.set(resourceType, registration)
    this.setData(this.#discoveryKey, registry)
  }

  /** Every `[resourceType, registration]` pair registered for `application`, or `[]` if none. */
  public getProviders(application: string): [string, DiscoveryRegistration][] {
    const registry = this.getData<Map<string, Map<string, DiscoveryRegistration>>>(
      this.#discoveryKey,
    )
    const byResource = registry?.get(application)
    return byResource ? Array.from(byResource.entries()) : []
  }

  /**
   * Removes every Application's bucket EXCEPT those in `preserve` — the Discovery-side counterpart
   * of `RouteContainer.resetExceptApplications`, used the same way by `finalize` cleanup so an
   * independent, temporally-overlapping boot session's not-yet-served Discovery providers survive.
   */
  public resetExceptApplications(preserve: Set<string>): void {
    const registry = this.getData<Map<string, Map<string, DiscoveryRegistration>>>(
      this.#discoveryKey,
    )
    if (!registry) return

    for (const application of registry.keys()) {
      if (!preserve.has(application)) registry.delete(application)
    }

    this.setData(this.#discoveryKey, registry)
  }
}
