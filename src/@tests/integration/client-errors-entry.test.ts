import { assert, assertEquals } from '@std/assert'

/**
 * `@zanix/server/client-errors` exists so a browser bundle can recognize a `RestClientError` without
 * the server. That is a property of the import graph, so it is checked on the real graph (`deno
 * info`), not on the file's own text: a future import added anywhere beneath it fails here.
 */

const ROOT = new URL('../../../', import.meta.url)

type Graph = { roots: string[]; modules: { specifier: string }[] }

async function graphOf(path: string): Promise<Graph> {
  const output = await new Deno.Command(Deno.execPath(), {
    args: ['info', '--json', path],
    cwd: ROOT,
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  assert(output.success, new TextDecoder().decode(output.stderr))
  return JSON.parse(new TextDecoder().decode(output.stdout))
}

const specifiers = (graph: Graph) => graph.modules.map((module) => module.specifier)

async function exportPath(name: string): Promise<string> {
  const config = await Deno.readTextFile(new URL('deno.jsonc', ROOT))
  const match = config.match(new RegExp(`"${name}":\\s*"([^"]+)"`))
  assert(match, `deno.jsonc declares no "${name}" export`)
  return match[1]
}

Deno.test('the client-errors entry reaches no server code, in particular no WorkerManager', async () => {
  const graph = await graphOf(await exportPath('./client-errors'))
  const reached = specifiers(graph)

  assertEquals(reached.filter((s) => s.includes('/workers/')), [])
  assertEquals(reached.filter((s) => s.includes('/infra/')), [])
  assertEquals(reached.filter((s) => s.includes('/webserver/')), [])
  // Its one dependency inside this package is nothing: the file itself, then `@zanix/errors`.
  assertEquals(
    reached.filter((s) => s.startsWith('file://') && !s.endsWith('rest-client-error.ts')),
    [],
  )
})

Deno.test('the root entry does reach the WorkerManager, which is why the subpath exists', async () => {
  // Keeps the test above meaningful: if the root ever stopped reaching it, the subpath would be moot
  // and this says so instead of the test above passing for a vacuous reason.
  const reached = specifiers(await graphOf(await exportPath('.')))
  assert(reached.some((s) => s.includes('/workers/')), 'the root entry no longer reaches workers')
})

Deno.test('the client-errors entry exports the same class the root does', async () => {
  const [{ RestClientError: fromSubpath }, { RestClientError: fromRoot }] = await Promise.all([
    import(new URL(await exportPath('./client-errors'), ROOT).href),
    import(new URL(await exportPath('.'), ROOT).href),
  ])
  assert(fromSubpath === fromRoot)
})
