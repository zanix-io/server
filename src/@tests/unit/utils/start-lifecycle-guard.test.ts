import { assertEquals, assertThrows } from '@std/assert'
import { InternalError } from '@zanix/errors'
import { createStartLifecycleGuard } from 'utils/start-lifecycle-guard.ts'

console.error = () => {}

function freshGuard(overlapNote?: string) {
  return createStartLifecycleGuard({
    startLabel: 'Test.start()',
    stopLabel: 'Test.stop()',
    source: 'test-source',
    overlapNote,
  })
}

Deno.test('createStartLifecycleGuard: guardReentry() does not throw on a fresh guard', () => {
  const guard = freshGuard()
  guard.guardReentry()
})

Deno.test(
  'createStartLifecycleGuard: a second guardReentry() while still starting throws, naming the overlap',
  () => {
    const guard = freshGuard()
    guard.guardReentry()
    const error = assertThrows(() => guard.guardReentry(), InternalError)
    assertEquals(
      error.message,
      'Test.start() was called again before a previous call in this process finished. Await ' +
        'the first call before starting another — two overlapping boots share the same ' +
        'process-wide route/DI/discovery registries, so racing them corrupts state silently ' +
        'instead of throwing.',
    )
    assertEquals(error.meta, { source: 'test-source', method: 'start' })
  },
)

Deno.test(
  'createStartLifecycleGuard: overlapNote is inserted verbatim right before "instead of throwing"',
  () => {
    const guard = freshGuard('(e.g. `admin` on the first call being dropped) ')
    guard.guardReentry()
    const error = assertThrows(() => guard.guardReentry(), InternalError)
    assertEquals(
      error.message,
      'Test.start() was called again before a previous call in this process finished. Await ' +
        'the first call before starting another — two overlapping boots share the same ' +
        'process-wide route/DI/discovery registries, so racing them corrupts state silently ' +
        '(e.g. `admin` on the first call being dropped) instead of throwing.',
    )
  },
)

Deno.test(
  'createStartLifecycleGuard: guardReentry() after markRunning() (no clearStarting()) throws the "already running" error',
  () => {
    const guard = freshGuard()
    guard.guardReentry()
    guard.markRunning()
    guard.clearStarting()
    const error = assertThrows(() => guard.guardReentry(), InternalError)
    assertEquals(
      error.message,
      'Test.start() was called again while a previous call in this process is still running. ' +
        'Call Test.stop() first — a second boot would register a second, independent set of ' +
        'servers against the same process-wide route/DI/discovery registries as the first, ' +
        'without ever releasing them.',
    )
    assertEquals(error.meta, { source: 'test-source', method: 'start' })
  },
)

Deno.test(
  'createStartLifecycleGuard: clearStarting() alone (a failed boot) does not mark it running — a retry is allowed',
  () => {
    const guard = freshGuard()
    guard.guardReentry()
    guard.clearStarting() // simulates a boot that threw before markRunning() ever ran
    guard.guardReentry() // must not throw — the failed boot released the guard
  },
)

Deno.test(
  'createStartLifecycleGuard: markStopped() releases the "already running" guard, allowing a fresh start',
  () => {
    const guard = freshGuard()
    guard.guardReentry()
    guard.markRunning()
    guard.clearStarting()
    guard.markStopped()
    guard.guardReentry() // must not throw — stop() released it
  },
)
