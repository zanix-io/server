import { assert, assertEquals } from '@std/assert'
import { BootSessionContainer } from 'modules/program/metadata/session.ts'

Deno.test({
  name: 'getForeignActiveApplications() is empty outside any session, with nothing else running',
  fn: () => {
    const sessions = new BootSessionContainer()
    assertEquals(sessions.getForeignActiveApplications(), new Set())
  },
})

Deno.test({
  name:
    "getForeignActiveApplications() excludes the CALLER's OWN session — it only ever contains OTHER sessions' Applications",
  fn: async () => {
    const sessions = new BootSessionContainer()

    await sessions.runSession(() => {
      sessions.recordApplication('admin')
      sessions.recordApplication('main')
      // No other session is active — this session's own Applications must not appear as "foreign"
      // to itself.
      assertEquals(sessions.getForeignActiveApplications(), new Set())
    })
  },
})

Deno.test({
  name: 'nested runSession() calls reuse the outer session instead of forking a new one',
  fn: async () => {
    const sessions = new BootSessionContainer()

    await sessions.runSession(async () => {
      sessions.recordApplication('outer')

      await sessions.runSession(() => {
        sessions.recordApplication('inner')
        // Still no OTHER session — the inner call reused the outer session rather than starting an
        // independent one, so 'outer'/'inner' are both "mine", never "foreign" to myself.
        assertEquals(sessions.getForeignActiveApplications(), new Set())
      })
    })
  },
})

Deno.test({
  name: 'a session that already fully exited no longer appears in getForeignActiveApplications()',
  fn: async () => {
    const sessions = new BootSessionContainer()

    await sessions.runSession(() => {
      sessions.recordApplication('first')
    })

    // The first session already returned — nothing left to protect from it.
    assertEquals(sessions.getForeignActiveApplications(), new Set())
  },
})

Deno.test({
  name:
    "a DIFFERENT, still-in-flight session's Applications appear as foreign while it is active, and stop appearing once it exits",
  fn: async () => {
    const sessions = new BootSessionContainer()

    let releaseOther: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseOther = resolve
    })

    const otherSession = sessions.runSession(async () => {
      sessions.recordApplication('admin-hub')
      await gate
    })
    await new Promise((resolve) => setTimeout(resolve, 0)) // let the other session actually start

    // Called with NO session of our own active — every currently-active session's Applications
    // count as foreign in that case.
    assertEquals([...sessions.getForeignActiveApplications()], ['admin-hub'])

    releaseOther()
    await otherSession

    assertEquals(sessions.getForeignActiveApplications(), new Set())
  },
})

Deno.test({
  name:
    "two concurrent, interleaved sessions each see only the OTHER's Applications as foreign, never their own",
  fn: async () => {
    const sessions = new BootSessionContainer()
    const seenByA: Set<string>[] = []
    const seenByB: Set<string>[] = []

    // Explicit barrier — both sessions must have recorded their own Application before EITHER is
    // allowed to check `getForeignActiveApplications()`, so both are guaranteed to still be active
    // (a `setTimeout`-based race would let the shorter one exit before the longer one ever checks).
    let resolveARecorded: () => void = () => {}
    let resolveBRecorded: () => void = () => {}
    const aRecorded = new Promise<void>((
      resolve,
    ) => (resolveARecorded = resolve))
    const bRecorded = new Promise<void>((
      resolve,
    ) => (resolveBRecorded = resolve))

    const sessionA = sessions.runSession(async () => {
      sessions.recordApplication('a1')
      resolveARecorded()
      await bRecorded // wait for B to have recorded its own Application too
      seenByA.push(sessions.getForeignActiveApplications())
    })

    const sessionB = sessions.runSession(async () => {
      sessions.recordApplication('b1')
      resolveBRecorded()
      await aRecorded // wait for A to have recorded its own Application too
      seenByB.push(sessions.getForeignActiveApplications())
    })

    await Promise.all([sessionA, sessionB])

    assert(seenByA[0]?.has('b1'), "A must see B's Application as foreign")
    assert(
      !seenByA[0]?.has('a1'),
      'A must never see its OWN Application as foreign',
    )
    assert(seenByB[0]?.has('a1'), "B must see A's Application as foreign")
    assert(
      !seenByB[0]?.has('b1'),
      'B must never see its OWN Application as foreign',
    )
  },
})
