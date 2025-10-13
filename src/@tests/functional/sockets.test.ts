import './setup.ts'

import { assertEquals } from '@std/assert'

Deno.test('connects to WebSocket server', async () => {
  const ws = new WebSocket('ws://0.0.0.0:20201/mysock/1')

  // Wait for the connection to open
  await new Promise((resolve) => (ws.onopen = resolve))

  ws.send(JSON.stringify({ email: 'iscam2216@gmail.com' }))

  const message = await new Promise((resolve) => {
    ws.onmessage = (event) => resolve(event.data)
  })

  assertEquals(
    message,
    JSON.stringify({
      'message': 'interactor D message',
      'socket': 1,
      'data': { 'email': 'iscam2216@gmail.com' },
    }),
  )

  ws.close()
})

Deno.test('should return error message on data validation', async () => {
  const ws = new WebSocket('ws://0.0.0.0:20201/mysock/1')

  // Wait for the connection to open
  await new Promise((resolve) => (ws.onopen = resolve))

  ws.send('ping')

  const message = await new Promise<string>((resolve) => {
    ws.onmessage = (event) => resolve(event.data)
  })

  assertEquals(
    message,
    JSON.stringify({
      message: '"ping" should be a valid JSON',
      name: 'HttpError',
      status: { code: 'BAD_REQUEST', value: 400 },
    }),
  )

  ws.send(JSON.stringify({ message: 'hola' }))
  const message2 = await new Promise<string>((resolve) => {
    ws.onmessage = (event) => resolve(event.data)
  })

  assertEquals(
    message2,
    JSON.stringify({
      'message': 'BAD_REQUEST',
      'name': 'HttpError',
      'status': { 'code': 'BAD_REQUEST', 'value': 400 },
      'cause': {
        'message': 'Request validation error',
        'properties': { 'email': [{ 'constraints': ["'email' must be a valid email address."] }] },
        'target': 'C',
      },
    }),
  )

  ws.close()
})
