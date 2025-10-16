import './setup.ts'

import { assertEquals } from '@std/assert'

const restUrl = 'http://0.0.0.0:8000/api'

Deno.test('Verifying controller api rest welcome service', async () => {
  const query = await fetch(`${restUrl}/welcome/iscam%40gmail.com?qparam=6`)
  const response = await query.json()
  assertEquals(response, {
    message: 'welcome:iscam@gmail.com',
    search: 6,
    searchParamByMid: 'param value interactor D message',
    secondMessage: 'interactor D message',
    connectorMessage: 'this connector is connected over def 465 by uuid context and query param 6',
    searchParamByPipe: 'Pipe search param',
  })
  assertEquals(query.headers.get('global-header'), 'global interceptor header')

  const query2 = await fetch(`${restUrl}/welcome/intercepted`)
  const response2 = await query2.json()
  assertEquals(response2.message, 'hello intercepted')
  assertEquals(query.headers.get('global-header'), 'global interceptor header')
})

Deno.test('Verifying bad request and not found on api rest welcome service', async () => {
  // email must be valid
  const query = await fetch(`${restUrl}/welcome/iscamgmail.com`)
  const response = await query.json()

  assertEquals(response.message, 'BAD_REQUEST')
  assertEquals(response.name, 'HttpError')
  assertEquals(response.status.value, 400)
  assertEquals(response.cause, {
    message: 'Request validation error',
    properties: {
      email: [
        {
          constraints: ["'email' must be a valid email address."],
          value: 'iscamgmail.com',
          plainValue: 'iscamgmail.com',
        },
      ],
    },
    target: 'C',
  })

  // only url encoded
  const query2 = await fetch(`${restUrl}/welcome/iscam@gmail.com`)
  const response2 = await query2.json()

  assertEquals(response2.message, 'NOT_FOUND')
  assertEquals(response2.name, 'HttpError')
  assertEquals(response2.status.value, 404)

  // qparam is required
  const query3 = await fetch(`${restUrl}/welcome/iscam%40gmail.com`)
  const response3 = await query3.json()

  assertEquals(response3.message, 'BAD_REQUEST')
  assertEquals(response3.name, 'HttpError')
  assertEquals(response3.status.value, 400)
  assertEquals(response3.cause, {
    message: 'Request validation error',
    properties: {
      qparam: [{ constraints: ["'qparam' must be a valid number."] }],
    },
    target: 'S',
  })
})
