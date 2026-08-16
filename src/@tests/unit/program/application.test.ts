import { assertEquals } from '@std/assert'
import { ApplicationContainer, DEFAULT_APPLICATION } from 'modules/program/metadata/application.ts'

Deno.test('getCurrent() is the default Application outside any define() scope', () => {
  const applications = new ApplicationContainer()
  assertEquals(applications.getCurrent(), DEFAULT_APPLICATION)
})

Deno.test(
  'define(name, setup) makes name the ambient Application for the duration of setup',
  async () => {
    const applications = new ApplicationContainer()
    let seenInside: string | undefined

    await applications.define('billing', () => {
      seenInside = applications.getCurrent()
    })

    assertEquals(seenInside, 'billing')
    assertEquals(
      applications.getCurrent(),
      DEFAULT_APPLICATION,
      'the ambient scope must end once define() itself returns',
    )
  },
)

// This is the exact scenario `AsyncContext`'s own doc flags as worth a dedicated regression test
// (Deno's `node:async_hooks` compatibility layer, not a Deno-native API, is what backs this) — two
// genuinely concurrent `Zanix.start()`/`ZanixAdminHub.start()`-style sequences, each opening their
// own `define()` scope with real interleaving between them, not just sequential calls.
Deno.test(
  "two concurrent, interleaved define() calls each see only their own Application, never the other's",
  async () => {
    const applications = new ApplicationContainer()
    const seenByA: string[] = []
    const seenByB: string[] = []

    // Explicit barrier — both calls must have entered their own scope before EITHER continues past
    // the interleaving point, so both are guaranteed to genuinely overlap (a `setTimeout`-based race
    // would let the shorter one exit before the longer one ever checks).
    let resolveAEntered: () => void = () => {}
    let resolveBEntered: () => void = () => {}
    const aEntered = new Promise<void>((
      resolve,
    ) => (resolveAEntered = resolve))
    const bEntered = new Promise<void>((
      resolve,
    ) => (resolveBEntered = resolve))

    const callA = applications.define('billing', async () => {
      seenByA.push(applications.getCurrent())
      resolveAEntered()
      await bEntered
      seenByA.push(applications.getCurrent())
    })

    const callB = applications.define('reviews', async () => {
      seenByB.push(applications.getCurrent())
      resolveBEntered()
      await aEntered
      seenByB.push(applications.getCurrent())
    })

    await Promise.all([callA, callB])

    assertEquals(
      seenByA,
      ['billing', 'billing'],
      "A must never see B's Application",
    )
    assertEquals(
      seenByB,
      ['reviews', 'reviews'],
      "B must never see A's Application",
    )
  },
)
