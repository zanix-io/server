import { assertEquals, assertMatch } from '@std/assert'
import { uuidRegex } from '@zanix/regex'
import { pathToRegex } from 'utils/routes.ts'
import { getTargetKey } from 'utils/targets.ts'
import { contextId } from 'utils/context.ts'

console.error = () => {}

Deno.test('contextId should return a correct uuid', () => {
  assertMatch(contextId(), uuidRegex)
})

Deno.test('pathToRegex should be return a correct regex for a route with params', () => {
  // `pathToRegex` now always compiles with the `d` flag (adds `.indices` to a successful `exec()`
  // result, never changes what matches) — see the trailing catch-all feature's own design.
  assertEquals(
    pathToRegex('route/:param-1/v/:param-2'),
    /^route(\/[a-zA-Z0-9_.%-]+)\/v(\/[a-zA-Z0-9_.%-]+)$/d,
  )

  assertEquals(
    pathToRegex('route/:param-1?/v/:param-2'),
    /^route(\/[a-zA-Z0-9_.%-]+)?\/v(\/[a-zA-Z0-9_.%-]+)$/d,
  )

  assertEquals(
    pathToRegex('route/:param_1/v/:param_2'),
    /^route(\/[a-zA-Z0-9_.%-]+)\/v(\/[a-zA-Z0-9_.%-]+)$/d,
  )
})

Deno.test('getTargetKey for different classes with the same name', () => {
  class ZanixClass {
    #v = 0
  }

  assertEquals(getTargetKey(ZanixClass), 'Z$ZanixClass$1')
  assertEquals(
    getTargetKey(
      class ZanixClass {
        #v = 0
      },
    ),
    'Z$ZanixClass$2',
  )
  assertEquals(
    getTargetKey(
      class ZanixClass {
        #v = 0
      },
    ),
    'Z$ZanixClass$3',
  )
  assertEquals(getTargetKey(ZanixClass), 'Z$ZanixClass$1')
})
