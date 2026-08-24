import { assertEquals, assertStringIncludes } from '@std/assert'
import { fromFileUrl, join } from '@std/path'
import { getTemporaryFolder } from '@zanix/helpers'

/**
 * `WebServerManager` installs global `onerror`/`unhandledrejection` handlers
 * (`attachGlobalErrorHandlers`, `utils/errors/process.ts`) lazily, inside `#start()`, the first
 * time a server actually binds a real listener — never as a module-eval side effect of merely
 * importing `@zanix/server`, and never merely from `create()` registering a dispatch entry
 * without starting it.
 *
 * Every case below asserts on the exact, distinctive log line `attachGlobalErrorHandlers` itself
 * produces (`An unhandled rejection error has been detected: ...`), never on the subprocess's exit
 * code or on whether it crashed: an entirely separate, unrelated mechanism elsewhere in this
 * project's own dependency graph already suppresses an uncaught rejection's default crash
 * regardless of whether `attachGlobalErrorHandlers` ever runs, which would make exit-code-based
 * assertions pass or fail for the wrong reason. The log line is unique to this package's own
 * handler, so its presence or absence is what actually answers "did `attachGlobalErrorHandlers`
 * run" — that separate mechanism, whatever it is, is out of this file's scope.
 *
 * "Were global handlers ever installed in THIS process" is itself process-wide state, so every
 * case below still runs in its own subprocess — any other test file that imports `@zanix/server`
 * and starts a server in the same process would make it unobservable here, the same reasoning
 * `graphql-lazy-config.test.ts` already applies to this file's sibling scenario.
 *
 * @module
 */

const ROOT = fromFileUrl(import.meta.resolve('../../../'))
const LOG_MARKER = 'An unhandled rejection error has been detected'

/** Writes `script` to a fresh temp fixture and runs it as its own `deno run` subprocess. */
async function runFixture(
  script: string,
  prefix: string,
): Promise<{ stdout: string; stderr: string }> {
  const dir = await Deno.makeTempDir({
    dir: getTemporaryFolder(import.meta.url),
    prefix,
  })
  try {
    const path = join(dir, 'fixture.ts')
    await Deno.writeTextFile(path, script)
    const { stdout, stderr } = await new Deno.Command(Deno.execPath(), {
      args: [
        'run',
        '--allow-all',
        '--no-check',
        '--min-dep-age=0',
        '--config',
        join(ROOT, 'deno.jsonc'),
        path,
      ],
      cwd: ROOT,
    }).output()
    return {
      stdout: new TextDecoder().decode(stdout),
      stderr: new TextDecoder().decode(stderr),
    }
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
}

Deno.test(
  'global error handlers: merely importing @zanix/server never installs them',
  async () => {
    const { stderr } = await runFixture(
      `// deno-coverage-ignore-file
import '${ROOT}mod.ts'

Promise.reject(new Error('boom-import-only'))

// Keeps the event loop alive long enough for the runtime's own unhandled-rejection detection to
// run before the process exits — with no pending op left, this module would otherwise finish
// evaluating and exit before that check ever happens.
await new Promise((resolve) => setTimeout(resolve, 100))
`,
      'global-handlers-import-only-',
    )

    assertEquals(stderr.includes(LOG_MARKER), false, `expected no install log, got:\n${stderr}`)
  },
)

Deno.test(
  'global error handlers: registering a server via create() without starting it never installs them either',
  async () => {
    const { stderr } = await runFixture(
      `// deno-coverage-ignore-file
import { webServerManager } from '${ROOT}mod.ts'

webServerManager.create('rest', { handler: () => new Response('ok') })

Promise.reject(new Error('boom-created-not-started'))

await new Promise((resolve) => setTimeout(resolve, 100))
`,
      'global-handlers-created-not-started-',
    )

    assertEquals(stderr.includes(LOG_MARKER), false, `expected no install log, got:\n${stderr}`)
  },
)

Deno.test(
  'global error handlers: the first real listener bind installs them — a later uncaught rejection is logged instead of crashing the process',
  async () => {
    const { stderr } = await runFixture(
      `// deno-coverage-ignore-file
import { webServerManager } from '${ROOT}mod.ts'

const id = webServerManager.create('rest', {
  handler: () => new Response('ok'),
  server: { port: 4460 },
})
webServerManager.start(id)

Promise.reject(new Error('boom-after-start'))

await new Promise((resolve) => setTimeout(resolve, 300))
Deno.exit(0)
`,
      'global-handlers-after-start-',
    )

    assertStringIncludes(stderr, LOG_MARKER)
    assertStringIncludes(stderr, 'boom-after-start')
  },
)

Deno.test(
  'global error handlers: starting a second server never installs them twice — a single rejection is logged exactly once',
  async () => {
    const { stderr } = await runFixture(
      `// deno-coverage-ignore-file
import { webServerManager } from '${ROOT}mod.ts'

const id1 = webServerManager.create('rest', {
  handler: () => new Response('ok'),
  server: { port: 4460 },
})
webServerManager.start(id1)

const id2 = webServerManager.create('rest', {
  handler: () => new Response('ok'),
  server: { port: 4461 },
})
webServerManager.start(id2)

Promise.reject(new Error('boom-idempotent'))

await new Promise((resolve) => setTimeout(resolve, 300))
Deno.exit(0)
`,
      'global-handlers-idempotent-',
    )

    // Each log invocation repeats "boom-idempotent" itself (the message, the error's own
    // `.message`, and its stack trace) — the marker below, paired with the rejection's own text,
    // appears exactly once per actual log call, so counting it (rather than the bare substring)
    // reports how many times `attachGlobalErrorHandlers` actually installed, not how many times
    // the string happens to occur.
    const marker = `${LOG_MARKER}: boom-idempotent`
    const occurrences = stderr.split(marker).length - 1
    assertEquals(
      occurrences,
      1,
      `expected the rejection to be logged exactly once, found ${occurrences} times:\n${stderr}`,
    )
  },
)
