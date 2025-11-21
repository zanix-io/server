// deno-lint-ignore-file no-explicit-any
import './setup/mod.ts'

import { assert, assertEquals } from '@std/assert'
import { SOCKET_PORT } from './setup/mod.ts'
import ProgramModule from 'modules/program/mod.ts'
import { isUUID } from '@zanix/validator'

const sockerUrl = `ws://0.0.0.0:${SOCKET_PORT}/sock/mysock`

const baseOptions = { headers: { 'Origin': '*' } }

Deno.test('connects to WebSocket server', async () => {
  const ws = new WebSocket(`${sockerUrl}/1`, baseOptions)

  // Wait for the connection to open
  await new Promise((resolve) => (ws.onopen = resolve))

  ws.send(JSON.stringify({ email: 'pepito.perez@email.com' }))

  const message: any = await new Promise((resolve) => {
    ws.onmessage = (event) => resolve(event.data)
  })

  const data = JSON.parse(message)

  const contextId = data.contextId
  delete data.contextId

  assert(contextId)
  assert(ProgramModule.context.getContext(contextId).id)

  assertEquals(
    data,
    {
      'message': 'interactor D message',
      'socket': 1,
      'data': { 'email': 'pepito.perez@email.com' },
    },
  )

  const oncloseEvent = new Promise((resolve) => {
    ws.addEventListener('close', () => {
      assert(!ProgramModule.context.getContext(contextId).id) // context should be deleted
      resolve('OK')
    })
  })

  ws.close()

  assert((await oncloseEvent) === 'OK')
})

Deno.test('should return error message on data validation', async () => {
  const ws = new WebSocket(`${sockerUrl}/1`, baseOptions)

  // Wait for the connection to open
  await new Promise((resolve) => (ws.onopen = resolve))

  ws.send('ping')

  const message: any = await new Promise<string>((resolve) => {
    ws.onmessage = (event) => resolve(event.data)
  })

  const jsonMessage = JSON.parse(message)
  assert(isUUID(jsonMessage.id))
  delete jsonMessage.id
  delete jsonMessage.contextId

  assertEquals(
    jsonMessage,
    {
      message: '"ping" should be a valid JSON',
      name: 'HttpError',
      status: { code: 'BAD_REQUEST', value: 400 },
    },
  )

  ws.send(JSON.stringify({ message: 'hola' }))
  const message2 = await new Promise<string>((resolve) => {
    ws.onmessage = (event) => resolve(event.data)
  })
  const jsonMessage2 = JSON.parse(message2)
  assert(isUUID(jsonMessage2.id))
  delete jsonMessage2.id
  delete jsonMessage2.contextId
  assertEquals(
    jsonMessage2,
    {
      message: 'BAD_REQUEST',
      name: 'HttpError',
      status: { code: 'BAD_REQUEST', value: 400 },
      cause: {
        message: 'Request validation error',
        properties: { 'email': [{ 'constraints': ["'email' must be a valid email address."] }] },
        target: 'C',
      },
    },
  )

  ws.close()
})
