import { assertEquals } from '@std/assert'
import { resolveApplicationServerId, resolvePreviousApplicationServerId } from 'utils/app-server.ts'

Deno.test({
  name: 'resolveApplicationServerId: returns undefined when the stable-id env var is unset',
  fn: () => {
    assertEquals(resolveApplicationServerId('znx-test-app', 'rest'), undefined)
  },
})

Deno.test({
  name:
    'resolveApplicationServerId: maps the application name to its env var and suffixes the type',
  fn: () => {
    Deno.env.set('ZNX_TEST_APP_SERVER_ID', 'stable-id')
    try {
      assertEquals(
        resolveApplicationServerId('znx-test-app', 'graphql'),
        'stable-id-graphql',
      )
    } finally {
      Deno.env.delete('ZNX_TEST_APP_SERVER_ID')
    }
  },
})

Deno.test({
  name:
    'resolvePreviousApplicationServerId: returns undefined when the retiring-id env var is unset',
  fn: () => {
    assertEquals(
      resolvePreviousApplicationServerId('znx-test-app', 'socket'),
      undefined,
    )
  },
})

Deno.test({
  name:
    'resolvePreviousApplicationServerId: maps the application name to its env var and suffixes the type',
  fn: () => {
    Deno.env.set('ZNX_TEST_APP_SERVER_ID_PREVIOUS', 'old-id')
    try {
      assertEquals(
        resolvePreviousApplicationServerId('znx-test-app', 'rest'),
        'old-id-rest',
      )
    } finally {
      Deno.env.delete('ZNX_TEST_APP_SERVER_ID_PREVIOUS')
    }
  },
})
