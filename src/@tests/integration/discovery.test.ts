import type { DiscoveryProvider } from 'typings/discovery.ts'

import { assertEquals } from '@std/assert'
import ProgramModule from 'modules/program/mod.ts'

const provider: DiscoveryProvider<unknown> = {
  snapshot: () => Promise.resolve([]),
}

Deno.test(
  'defineDiscovery: genuinely concurrent defineApplication scopes attribute correctly, regardless of interleaving',
  async () => {
    // Mirrors ApplicationContainer's own AsyncContext-based design goal: two Promise.all-parallel
    // defineApplication calls must each keep their own ambient Application, even though their own
    // `setup` bodies interleave arbitrarily (a `await` inside one lets the other's own composition
    // run before the first resumes) — a flat mutable "current Application" variable would let
    // whichever one resumes last silently misattribute the other's registration.
    await Promise.all([
      ProgramModule.applications.define('concurrent-a', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        ProgramModule.discovery.define('concurrent-a', 'shared-resource-name', {
          provider,
          guards: [],
        })
      }),
      ProgramModule.applications.define('concurrent-b', () => {
        ProgramModule.discovery.define('concurrent-b', 'shared-resource-name', {
          provider,
          guards: [],
        })
      }),
    ])

    assertEquals(
      ProgramModule.discovery.getProviders('concurrent-a').map(([type]) => type),
      [
        'shared-resource-name',
      ],
    )
    assertEquals(
      ProgramModule.discovery.getProviders('concurrent-b').map(([type]) => type),
      [
        'shared-resource-name',
      ],
    )
  },
)
