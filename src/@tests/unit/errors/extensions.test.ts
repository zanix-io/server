import { assert, assertEquals, assertExists, assertFalse, assertNotEquals } from '@std/assert'
import { HttpError, PermissionDenied } from '@zanix/errors'
import { getExtendedErrorResponse, httpErrorResponse, logAppError } from 'utils/errors/helper.ts'

Deno.test('getExtendedErrorResponse should generate a new id if none exists', () => {
  const error = { message: 'Test error' }

  const response = getExtendedErrorResponse(error)

  // El id no debe estar vacío y debe ser un UUID válido
  assertExists(response.id)
  assertEquals(response.id.length, 36) // UUID tiene una longitud de 36 caracteres
})

Deno.test('getExtendedErrorResponse should retain the provided id', () => {
  const error = { message: 'Test error', id: '1234' }

  const response = getExtendedErrorResponse(error)

  // El id debe ser el mismo que el proporcionado
  assertEquals(response.id, '1234')
})

Deno.test('getExtendedErrorResponse should add contextId if provided', () => {
  const error = { message: 'Test error' }
  const contextId = 'context-123'

  const response = getExtendedErrorResponse(error, contextId)

  // Verificar que contextId esté presente
  assertEquals(response.contextId, contextId)
})

Deno.test('getExtendedErrorResponse should generate a unique UUID when no id exists', () => {
  const error1 = { message: 'Test error 1' }
  const error2 = { message: 'Test error 2' }

  const response1 = getExtendedErrorResponse(error1)
  const response2 = getExtendedErrorResponse(error2)

  // Verificar que los UUIDs sean diferentes
  assertNotEquals(response1.id, response2.id)
})

Deno.test('getExtendedErrorResponse should create new object to override it', () => {
  const error = Object.freeze({ message: 'Test error', meta: { source: 'my-app' } })

  const response = getExtendedErrorResponse(error)

  assertEquals(response.meta.source, 'my-app')
  assertEquals(response.message, 'Test error')
  assertFalse('contextId' in response)
})

Deno.test('getExtendedErrorResponse should create new object to override it', async () => {
  let error = Object.freeze(
    new HttpError('BAD_REQUEST', {
      cause: 'cause message',
    }),
  )

  let response = getExtendedErrorResponse(error)
  assertEquals(
    response.cause,
    'cause message',
  )

  error = Object.freeze(
    new HttpError('BAD_REQUEST', {
      cause: new PermissionDenied('Token signature is invalid', {
        code: 'INVALID_TOKEN_SIGNATURE',
        cause: new PermissionDenied('Token signature is invalid', {
          code: 'INVALID_TOKEN_SIGNATURE',
          cause: 'The provided token signature does not match the expected signature',
          meta: { source: 'zanix' },
        }),
        meta: { source: 'zanix' },
      }),
    }),
  )
  response = await httpErrorResponse(error).json()

  assertEquals(
    response.cause.cause.cause,
    'The provided token signature does not match the expected signature',
  )
})

Deno.test('httpErrorResponse should return all data after log', async () => {
  // deno-lint-ignore no-explicit-any
  const error: any = new Error('BAD_REQUEST')

  console.error = () => {}

  logAppError(error, {
    message: 'message',
    code: 'CODE',
  })

  assert(error.id)
  const response = await httpErrorResponse(error).json()

  assertEquals(error.id, response.id)
  assertEquals(response.name, 'Error')
  assertEquals(response.message, 'BAD_REQUEST')
})
