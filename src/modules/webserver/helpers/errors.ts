import { JSON_CONTENT_HEADER } from 'utils/constants.ts'
import { serializeError } from '@zanix/errors'

export const baseErrorResponses = (error: unknown) => {
  const serializedError = serializeError(error)
  delete serializedError.stack

  return JSON.stringify(serializedError)
}

export const errorResponses = (error: unknown) => {
  return new Response(baseErrorResponses(error), {
    headers: JSON_CONTENT_HEADER,
    status: error?.['status' as never]?.['value'] || 400,
  })
}
