import { assert, assertEquals } from '@std/assert'

/**
 * Structural guard rail for the `.`/`./graphql` split: the root `.` barrel (`mod.ts`) must never
 * resolve `npm:graphql` (or any other npm package — this package's only npm dependency is
 * `graphql`), while `./graphql`'s own entry file (`handlers/graphql/mod.ts`) must still resolve it.
 * Verified via `deno info --json`'s actual resolved module graph for each entry point
 * independently — transitive reachability, not a grep over `deno.jsonc`'s own `imports` map. The
 * same shape `@zanix/datamaster`'s own `dependency-boundary.test.ts` files use for its `/dlq` and
 * `/cache` subpaths.
 *
 * This is a regression guard for the split itself, not a re-test of `getMainHandler`'s own
 * registration-slot behavior (already covered in `webserver/handler.test.ts`) — that test verifies
 * runtime BEHAVIOR (throws/dispatches correctly); this one verifies the STATIC import graph never
 * regresses back to a direct value import of `handlers/graphql/handler.ts` from a file reachable
 * from root.
 *
 * @module
 */

const ENTRY_ROOT = 'mod.ts'
const ENTRY_GRAPHQL = 'src/modules/infra/handlers/graphql/mod.ts'

interface ModuleGraph {
  code: Set<string>
  type: Set<string>
}

async function moduleGraph(entry: string): Promise<ModuleGraph> {
  const command = new Deno.Command(Deno.execPath(), {
    args: ['info', '--json', entry],
    stdout: 'piped',
    stderr: 'piped',
  })
  const { stdout, stderr, success } = await command.output()
  if (!success) {
    throw new Error(`'deno info --json ${entry}' failed: ${new TextDecoder().decode(stderr)}`)
  }

  // deno-lint-ignore no-explicit-any -- `deno info --json`'s own output shape, not this package's.
  const parsed: any = JSON.parse(new TextDecoder().decode(stdout))
  const code = new Set<string>()
  const type = new Set<string>()
  for (const module of parsed.modules ?? []) {
    for (const dep of module.dependencies ?? []) {
      if (dep.code?.specifier) code.add(dep.code.specifier)
      if (dep.type?.specifier) type.add(dep.type.specifier)
    }
  }
  return { code, type }
}

/** Matches a resolved `npm:` specifier for `packageName`, tolerating the `npm:/pkg@version` and
 * `npm:pkg@version` shapes `deno info --json` uses across scoped/unscoped packages. */
function includesNpmPackage(specifiers: Set<string>, packageName: string): boolean {
  return [...specifiers].some((specifier) =>
    specifier.startsWith(`npm:/${packageName}@`) || specifier.startsWith(`npm:${packageName}@`)
  )
}

function anyNpmPackage(specifiers: Set<string>): string[] {
  return [...specifiers].filter((specifier) => specifier.startsWith('npm:'))
}

Deno.test(
  `${ENTRY_ROOT}: the root barrel never resolves npm:graphql (or any other npm package) as code ` +
    'or as a type — a REST/Socket/SSR-only consumer of the root entry point materializes zero npm ' +
    'packages',
  async () => {
    const graph = await moduleGraph(ENTRY_ROOT)
    assert(
      !includesNpmPackage(graph.code, 'graphql'),
      `${ENTRY_ROOT} must never resolve npm:graphql as code`,
    )
    assert(
      !includesNpmPackage(graph.type, 'graphql'),
      `${ENTRY_ROOT} must never resolve npm:graphql as a type`,
    )
    assertEquals(anyNpmPackage(graph.code), [], `${ENTRY_ROOT} must resolve zero npm packages`)
    assertEquals(anyNpmPackage(graph.type), [], `${ENTRY_ROOT} must resolve zero npm packages`)
  },
)

Deno.test(
  `${ENTRY_GRAPHQL}: the narrow @zanix/server/graphql subpath still resolves npm:graphql as code ` +
    '— a sanity check that the boundary guard above is testing a real split, not an accidentally ' +
    'unreachable subpath',
  async () => {
    const graph = await moduleGraph(ENTRY_GRAPHQL)
    assert(
      includesNpmPackage(graph.code, 'graphql'),
      `${ENTRY_GRAPHQL} must resolve npm:graphql as code`,
    )
  },
)
