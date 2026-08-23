import { assert, assertEquals, assertExists, assertFalse, assertNotEquals } from '@std/assert'
import { HttpError, PermissionDenied } from '@zanix/errors'
import { getExtendedErrorResponse, httpErrorResponse, logAppError } from 'utils/errors/helper.ts'
import { spy } from '@std/testing/mock'
import logger from '@zanix/logger'

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

Deno.test('getExtendedErrorResponse includes userMessage when the error carries one', () => {
  const error = {
    message: 'Unique constraint violation on users.email',
    userMessage: 'That email is already registered. Try signing in instead.',
  }

  const response = getExtendedErrorResponse(error)

  assertEquals(response.userMessage, 'That email is already registered. Try signing in instead.')
  // The technical `message` still reaches the response too — `userMessage` is an addition, not a
  // replacement (deciding whether to stop including `message` by default is a separate, tracked
  // decision, not something this function does on its own).
  assertEquals(response.message, 'Unique constraint violation on users.email')
})

Deno.test('getExtendedErrorResponse omits userMessage when the error has none', () => {
  const error = { message: 'Test error' }

  const response = getExtendedErrorResponse(error)

  assertFalse('userMessage' in response)
})

Deno.test('getExtendedErrorResponse strips a non-string userMessage', () => {
  // deno-lint-ignore no-explicit-any
  const error: any = { message: 'Test error', userMessage: { unexpected: 'shape' } }

  const response = getExtendedErrorResponse(error)

  assertFalse('userMessage' in response)
})

Deno.test('getExtendedErrorResponse should handle a falsy error gracefully', () => {
  const response = getExtendedErrorResponse(null)

  assertExists(response.id)
  assertEquals(response.id.length, 36)
})

Deno.test('getExtendedErrorResponse should generate a unique UUID when no id exists', () => {
  const error1 = { message: 'Test error 1' }
  const error2 = { message: 'Test error 2' }

  const response1 = getExtendedErrorResponse(error1)
  const response2 = getExtendedErrorResponse(error2)

  // Verificar que los UUIDs sean diferentes
  assertNotEquals(response1.id, response2.id)
})

Deno.test('getExtendedErrorResponse (internal, full detail) always includes meta', () => {
  const error = Object.freeze({
    message: 'Test error',
    meta: { source: 'my-app' },
  })

  const response = getExtendedErrorResponse(error)

  assertEquals(response.meta.source, 'my-app')
  assertEquals(response.message, 'Test error')
  assertFalse('contextId' in response)
})

Deno.test('httpErrorResponse omits meta by default', async () => {
  const error = { message: 'Test error', meta: { source: 'my-app' } }

  const response = await httpErrorResponse(error).json()

  assertFalse('meta' in response)
  assertEquals(response.message, 'Test error')
})

Deno.test('httpErrorResponse includes meta when exposeMeta is true', async () => {
  const error = {
    message: 'Request failed validation',
    meta: { field: 'email', reason: 'invalid_format' },
    exposeMeta: true,
  }

  const response = await httpErrorResponse(error).json()

  assertEquals(response.meta, { field: 'email', reason: 'invalid_format' })
})

Deno.test('getExtendedErrorResponse (internal, full detail) always includes cause', () => {
  const error = Object.freeze(
    new HttpError('BAD_REQUEST', {
      cause: 'cause message',
    }),
  )

  const response = getExtendedErrorResponse(error)
  assertEquals(response.cause, 'cause message')
})

const buildNestedCauseError = (exposeCause?: boolean) => {
  const error = new HttpError('BAD_REQUEST', {
    cause: new PermissionDenied('Token signature is invalid', {
      code: 'INVALID_TOKEN_SIGNATURE',
      cause: new PermissionDenied('Token signature is invalid', {
        code: 'INVALID_TOKEN_SIGNATURE',
        cause: 'The provided token signature does not match the expected signature',
        meta: { source: 'zanix' },
      }),
      meta: { source: 'zanix' },
    }),
  })
  // Set directly on the instance, not through the constructor's `options.exposeCause`: the
  // published `@zanix/errors` this test resolves `HttpError`/`PermissionDenied` from may still
  // lag behind the local, not-yet-published `exposeCause` option, in which case the constructor
  // itself wouldn't know to set it — `getPublicErrorResponse` only ever reads the property off
  // the instance, so setting it this way exercises exactly the same read path either way.
  if (exposeCause) (error as unknown as Record<string, unknown>).exposeCause = true
  return Object.freeze(error)
}

Deno.test('httpErrorResponse omits cause by default, even several layers deep', async () => {
  const response = await httpErrorResponse(buildNestedCauseError()).json()
  assertFalse('cause' in response)
})

Deno.test('httpErrorResponse includes the full cause chain when exposeCause is true', async () => {
  const response = await httpErrorResponse(buildNestedCauseError(true)).json()
  assertEquals(
    response.cause.cause.cause,
    'The provided token signature does not match the expected signature',
  )
})

Deno.test('logAppError should not throw when the error object cannot be mutated', async () => {
  console.error = () => {}
  const error = Object.freeze(new Error('frozen error'))

  await logAppError(error, { message: 'message', code: 'CODE' })
})

Deno.test('httpErrorResponse should return all data after log', async () => {
  // deno-lint-ignore no-explicit-any
  const error: any = new Error('BAD_REQUEST')

  console.error = () => {}

  await logAppError(error, {
    message: 'message',
    code: 'CODE',
  })

  assert(error.id)
  const response = await httpErrorResponse(error).json()

  assertEquals(error.id, response.id)
  assertEquals(response.name, 'Error')
  assertEquals(response.message, 'BAD_REQUEST')
})

Deno.test({
  name:
    'logAppError: stamps the SAME error object `_logged: true`, so a later call with that exact instance is skipped',
  fn: async () => {
    console.error = () => {}
    const logSpy = spy(logger, 'error')

    const error = new Error('shared error instance')
    await logAppError(error, { message: 'first log', code: 'CODE' })
    await logAppError(error, { message: 'second log (same object)', code: 'CODE' })

    assertEquals(logSpy.calls.length, 1)
    assertEquals(logSpy.calls[0].args[0], 'first log')

    logSpy.restore()
  },
})

/**
 * Blindaje (freeze) test — locks in an already-correct behavior: the client-facing error response
 * (`httpErrorResponse`/`getSerializedErrorResponse`, both backed by `getExtendedErrorResponse` with
 * its `withStackTrace` default of `false`) never leaks `error.stack` — or any equivalently-named
 * field carrying the stack trace text — to the wire, even when the thrown error (and a chained
 * `cause`) has a real, populated `.stack`. The stack must only ever reach `logAppError`'s internal
 * logging path, which explicitly opts into `withStackTrace: true`.
 */
Deno.test({
  name:
    'httpErrorResponse never leaks error.stack (or a differently-named equivalent) to the client',
  fn: async () => {
    const cause = new Error('root cause')
    const error = new Error('Something broke internally', { cause })

    // Sanity: real, V8-shaped stack traces exist on both errors before they go through the
    // response-building path, so the assertions below are actually exercising the redaction.
    assert(typeof error.stack === 'string' && error.stack.includes(' at '))
    assert(typeof cause.stack === 'string' && cause.stack.includes(' at '))
    const firstStackFrame = error.stack.split('\n')[1]?.trim()
    assert(firstStackFrame)

    const response = httpErrorResponse(error)
    const rawBody = await response.clone().text()
    const json = JSON.parse(rawBody)

    // No top-level `stack` field, nor on the nested `cause`.
    assertFalse('stack' in json)
    assertFalse('stack' in (json.cause ?? {}))

    // No differently-named field anywhere in the body smuggles the trace in instead.
    const keysMentioningStack = (obj: Record<string, unknown>): string[] =>
      Object.keys(obj).filter((k) => k.toLowerCase().includes('stack'))
    assertEquals(keysMentioningStack(json), [])
    assertEquals(keysMentioningStack(json.cause ?? {}), [])

    // Belt-and-braces: the literal stack-trace text itself never appears anywhere in the
    // serialized body, under any field name.
    assertFalse(rawBody.includes(firstStackFrame))
    assertFalse(rawBody.includes(' at '))

    // Contrast check: the same underlying serializer DOES include `stack` when explicitly asked
    // to (the path `logAppError` uses for internal logging) — proving the client path's omission
    // above is a deliberate default, not `serializeError` simply never supporting stacks at all.
    const internalError = getExtendedErrorResponse(error, undefined, true)
    assertEquals(internalError.stack, error.stack)
  },
})

Deno.test({
  name:
    'logAppError still logs the full meta/cause even when exposeMeta/exposeCause are unset — the client-facing narrowing never reaches it',
  fn: async () => {
    console.error = () => {}
    const logSpy = spy(logger, 'error')

    // INTERNAL_SERVER_ERROR (500), not BAD_REQUEST (400): `shouldNotLogError` throttles repeated
    // 4xx errors by default (see its own doc) — a fresh 400 could be silently skipped depending on
    // how many other tests in this file already logged one, making this test flaky for a reason
    // unrelated to what it's actually checking. `>= 500` always logs, unthrottled, by design.
    const error = new HttpError('INTERNAL_SERVER_ERROR', {
      cause: new Error('root cause with an internal hostname'),
      meta: { internalConnectionId: 'conn-42' },
    })

    await logAppError(error, { message: 'connector init failed', code: 'CODE' })

    const loggedPayload = logSpy.calls[0].args[1] as {
      meta: Record<string, unknown>
      cause: { message: string }
    }
    assertEquals(loggedPayload.meta, { internalConnectionId: 'conn-42' })
    assertEquals(loggedPayload.cause.message, 'root cause with an internal hostname')

    // The client-facing response for the SAME error, in contrast, has neither — proving this
    // isn't just "exposeMeta/exposeCause happened to be true," it's the split actually working.
    const response = await httpErrorResponse(error).json()
    assertFalse('meta' in response)
    assertFalse('cause' in response)

    logSpy.restore()
  },
})

Deno.test({
  name:
    'logAppError: never suppresses a DIFFERENT error object, even with an identical message/code to one already logged',
  fn: async () => {
    console.error = () => {}
    const logSpy = spy(logger, 'error')

    const first = new Error('duplicate text')
    const second = new Error('duplicate text') // same message, but a genuinely different instance

    await logAppError(first, { message: 'same message', code: 'SAME_CODE' })
    await logAppError(second, { message: 'same message', code: 'SAME_CODE' })

    // Both are real, distinct occurrences — neither should be silently dropped.
    assertEquals(logSpy.calls.length, 2)

    logSpy.restore()
  },
})
