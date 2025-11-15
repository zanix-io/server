import { assertEquals, assertMatch, assertThrows } from '@std/assert'
import { uuidRegex } from '@zanix/regex'
import { cleanRoute, pathToRegex } from 'utils/routes.ts'
import { processUrlParams } from 'utils/params.ts'
import { getTargetKey } from 'utils/targets.ts'
import { contextId } from 'utils/context.ts'

Deno.test('contextId should return a correct uuid', () => {
  assertMatch(contextId(), uuidRegex)
})

Deno.test('cleanRoute should return the correct route', () => {
  assertEquals(cleanRoute('/home/user//documents//file.txt'), '/home/user/documents/file.txt')
  assertEquals(cleanRoute('//etc/ / var/www/    /index.html'), '/etc/var/www/index.html')
  assertEquals(cleanRoute('///user//desktop//file///'), '/user/desktop/file')
  assertEquals(cleanRoute('Mayus/ROute/'), '/mayus/route')
  assertEquals(cleanRoute(''), '/')
})

Deno.test('pathToRegex should be return a correct regex for a route with params', () => {
  assertEquals(
    pathToRegex('route/:param-1/v/:param-2'),
    /^route(\/[a-zA-Z0-9_.%-]+)\/v(\/[a-zA-Z0-9_.%-]+)$/,
  )

  assertEquals(
    pathToRegex('route/:param-1?/v/:param-2'),
    /^route(\/[a-zA-Z0-9_.%-]+)?\/v(\/[a-zA-Z0-9_.%-]+)$/,
  )

  assertEquals(
    pathToRegex('route/:param_1/v/:param_2'),
    /^route(\/[a-zA-Z0-9_.%-]+)\/v(\/[a-zA-Z0-9_.%-]+)$/,
  )
})

Deno.test('processUrlParams should handle invalid URI components gracefully', () => {
  const input = {
    badString: '%E0%A4%A', // malformed
  }

  const result = processUrlParams(input)
  assertEquals(result.badString, '%E0%A4%A') // decoding fails, returns original
})

Deno.test('processUrlParams should return the same primitive value if not an object', () => {
  assertEquals(processUrlParams(null), null)
  assertEquals(processUrlParams(42), 42)
  assertEquals(processUrlParams('Test'), 'Test')
  assertEquals(processUrlParams(true), true)
})

Deno.test('processUrlParams should decode mixed nested arrays and objects', () => {
  const input = {
    users: [
      {
        name: 'Bob%20Builder',
        hobbies: ['Fixing%20things', 'Driving%20truck'],
      },
      {
        name: 'Wendy%20Helper',
      },
    ],
  }

  const expected = {
    users: [
      {
        name: 'Bob Builder',
        hobbies: ['Fixing things', 'Driving truck'],
      },
      {
        name: 'Wendy Helper',
      },
    ],
  }

  assertEquals(processUrlParams(input), expected)
})

Deno.test('getTargetKey for reserved classes', () => {
  class _ZanixClass {}

  assertThrows(() => getTargetKey(_ZanixClass), Deno.errors.Interrupted)
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
