import type { HealthCheckFn, HealthOptions, ServerHandler } from 'typings/server.ts'
import type { ZanixConnector } from 'modules/infra/connectors/base.ts'

import ProgramModule from 'modules/program/mod.ts'
import { getConnectors, getProviders } from 'modules/program/public.ts'
import logger from '@zanix/utils/logger'

/**
 * `BootstrapServerOptions.health` resolved into a fully-defaulted shape — the only value
 * `WebServerManager.create` ever consumes; `undefined` means health is disabled for this
 * `bootstrapServers()` call entirely.
 */
export type ResolvedHealthOptions = Required<HealthOptions>

const DEFAULT_HEALTH_PATH = '/health'
const DEFAULT_READY_PATH = '/ready'

/**
 * `boolean | HealthOptions | undefined` -> a fully-resolved config, or `undefined` when disabled.
 * Same pattern `resolveVersionProtocolOptions` (`middlewares/protocol-version.ts`) already
 * establishes for this exact `boolean | Options` shape: `false` disables, `true`/omitted enables
 * with defaults, an object overrides individual fields.
 */
export const resolveHealthOptions = (
  input: boolean | HealthOptions | undefined,
): ResolvedHealthOptions | undefined => {
  if (input === false) return undefined

  const options = input === true || input === undefined ? {} : input

  return {
    path: options.path ?? DEFAULT_HEALTH_PATH,
    readyPath: options.readyPath ?? DEFAULT_READY_PATH,
    checks: options.checks ?? {},
  }
}

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/**
 * Liveness — always cheap, always `200`, never runs a check. See `HealthOptions.checks`'s own doc
 * for why: a liveness probe must never depend on an external connector, or a temporarily-down
 * dependency would trigger orchestrator restart storms instead of just failing readiness.
 */
export const buildLivenessHandler = (): ServerHandler => () => jsonResponse({ status: 'ok' }, 200)

const runCheck = async (
  run: () => Promise<boolean> | boolean,
): Promise<boolean> => {
  try {
    return await run()
  } catch (e) {
    logger.error(
      '[runCheck]: Error occurred while running the health check',
      e,
    )
    return false
  }
}

/** One Application's own readiness slice — see {@linkcode buildReadinessHandler}'s own doc. */
type AppReadiness = {
  status: 'ok' | 'degraded'
  checks: Record<string, boolean>
}

/**
 * Readiness — reports two dimensions that are genuinely different in nature, never blended into
 * one flat bag:
 *
 * - `shared`: every auto-discovered core connector (`ProgramModule.targets`'s own `'connector'`
 *   registry, the same one `closeAllConnections` sweeps) — process-wide infrastructure that isn't
 *   owned by any one Application, so it's never attributed to one.
 * - `apps`: one entry per Application that registered a health-enabled `bootstrapServers()` call on
 *   this port, running only ITS OWN `HealthOptions.checks` — see `WebServerManager.create`'s own
 *   doc for how `appChecksByApplication` accumulates across every Application sharing a port
 *   (fixes the previous behavior where the first Application to claim the port silently owned
 *   `/ready` for every other Application sharing it, with their own `checks` never even run).
 *
 * Overall `status`/HTTP code is `ok`/`200` only when `shared` AND every entry in `apps` is
 * healthy; `503` otherwise.
 *
 * Per connector: `await connector.isReady` first — a one-time boot gate — and only if that
 * resolves `true` does `await connector.isHealthy()` run, matching `ZanixConnector`'s own doc
 * ("Throws if called before the system has been initialized properly"): `isHealthy()` is never
 * called on a connector that never finished initializing. A connector registered but never
 * actually instantiated (`autoInitialize` disabled and never manually resolved) is skipped
 * entirely — it isn't part of this process's live readiness contract, not reported as failing.
 *
 * Each Application's own `checks` receive a `HealthCheckContext` — `getProviders()`/
 * `getConnectors()` (`modules/program/public.ts`) called with no `ctxId`, the SAME
 * global-resolution shorthand `ProgramModule.providers`/`.connectors` are (see
 * `HealthCheckContext`'s own doc, `typings/server.ts`) — so a custom check can reach any registered
 * provider/connector, not just the auto-discovered core ones, without hand-rolling a
 * `ProgramModule` lookup itself.
 */
export const buildReadinessHandler = (
  appChecksByApplication: Map<string, Record<string, HealthCheckFn>>,
): ServerHandler =>
async () => {
  const connectorKeys = ProgramModule.targets.getTargetsByType('connector')

  const connectorEntries = await Promise.all(
    connectorKeys.map(async (key): Promise<[string, boolean] | undefined> => {
      const connector = ProgramModule.targets.getConnector<ZanixConnector>(
        key,
        {
          useExistingInstance: true,
        },
      )
      if (!connector) return undefined

      const ready = await connector.isReady
      if (!ready) return [key, false]

      return [key, await runCheck(() => connector.isHealthy())]
    }),
  )

  const sharedChecks = Object.fromEntries(
    connectorEntries.filter((entry): entry is [string, boolean] => !!entry),
  )
  const sharedHealthy = Object.values(sharedChecks).every(Boolean)

  const checkContext = {
    providers: getProviders(),
    connectors: getConnectors(),
  }

  const appEntries = await Promise.all(
    Array.from(appChecksByApplication).map(
      async ([application, customChecks]): Promise<[string, AppReadiness]> => {
        const entries = await Promise.all(
          Object.entries(customChecks).map(
            async ([name, check]): Promise<[string, boolean]> => [
              name,
              await runCheck(() => check.call(checkContext, checkContext)),
            ],
          ),
        )
        const checks = Object.fromEntries(entries)
        return [application, {
          status: Object.values(checks).every(Boolean) ? 'ok' : 'degraded',
          checks,
        }]
      },
    ),
  )
  const apps = Object.fromEntries(appEntries)

  const healthy = sharedHealthy &&
    Object.values(apps).every((app) => app.status === 'ok')

  return jsonResponse({
    status: healthy ? 'ok' : 'degraded',
    shared: { status: sharedHealthy ? 'ok' : 'degraded', checks: sharedChecks },
    apps,
  }, healthy ? 200 : 503)
}
