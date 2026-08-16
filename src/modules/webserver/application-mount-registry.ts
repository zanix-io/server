import { DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'
import { cleanRoute } from '@zanix/helpers'

/**
 * `Map<applicationName, mountPrefix>` — the ONLY place an Application-scoped mount prefix lives.
 * `ApplicationContainer`/`RouteContainer` never learn about mounting (identity only); this
 * registry, next to `compileRuntime`/`routeProcessor` (the layer that already resolves
 * `globalPrefix`), is the single source `routeProcessor` reads from when composing a route's
 * final, externally-exposed path. Written exactly once per Application, by whoever composes that
 * Application (today: nothing yet — `@zanix/app`'s `AppContainer`, once implemented, is the
 * intended writer via {@link registerApplicationMount}).
 */
const applicationMountRegistry = new Map<string, string>()

/**
 * Registers `application`'s mount prefix — the piece `routeProcessor` inserts between
 * `globalPrefix` and a route's own `controllerPrefix`/`methodPath` when composing its final,
 * externally-exposed path. Exported publicly (not module-private) because the intended writer
 * (`@zanix/app`'s `AppContainer`) lives in a SEPARATE package from `@zanix/server` — a
 * module-private registry would be unreachable from there.
 *
 * Idempotent last-write-wins by design — calling this twice for the same `application` (e.g. a
 * redundant re-registration) simply overwrites the prefix, no error. Normalizes `prefix` via
 * `cleanRoute` (same helper `RouteContainer`/`compileRuntime` already use for path segments), so
 * callers never need to worry about leading/trailing slashes themselves.
 *
 * @param application The Application (see `ApplicationContainer`) this mount prefix is for.
 * @param prefix The mount prefix — `''` is a valid, explicit "no prefix" registration (opt-out of
 * namespacing, still distinct from never calling this function at all, though both currently
 * resolve to the same empty-prefix behavior in `getApplicationMountPrefix`).
 */
export function registerApplicationMount(
  application: string,
  prefix: string,
): void {
  applicationMountRegistry.set(application, prefix ? cleanRoute(prefix) : '')
}

/**
 * Resolves `application`'s registered mount prefix, or `''` if none was ever registered for it —
 * every Application implicitly defaults to no mount prefix (the `DEFAULT_APPLICATION`/`'main'`
 * case, and any Application whose owner never calls {@link registerApplicationMount}), preserving
 * today's behavior exactly for anything that never opts into this mechanism.
 *
 * @param application The Application to resolve a mount prefix for.
 */
export function getApplicationMountPrefix(
  application: string = DEFAULT_APPLICATION,
): string {
  return applicationMountRegistry.get(application) ?? ''
}
