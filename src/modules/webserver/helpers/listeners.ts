import type { ServerOptions } from 'typings/server.ts'

import { httpErrorResponse, logAppError } from 'utils/errors/helper.ts'
import logger from '@zanix/logger'

export const onErrorListener =
  (currentErrorHandler: ServerOptions['onError'], serverName: string) =>
  async (error: unknown): Promise<Response> => {
    await logAppError(error, {
      message: `An error occurred on ${serverName} server`,
      code: 'SERVER_ERROR',
      meta: { serverName },
    })

    try {
      const response = await currentErrorHandler?.(error)
      if (response) return response
    } catch (handlerError) {
      // The consumer's own custom `onError` is itself broken — swallowed on purpose (a broken
      // consumer error handler must never take the whole server down), but that failure must still
      // leave a trace for an operator, distinct from the ORIGINAL error it was trying to handle
      // (already logged above via `logAppError`). Both errors are included: `error` for what was
      // being handled, `handlerError` for what the consumer's own handler threw in response.
      logger.error(
        `The custom 'onError' handler provided for ${serverName} server threw while handling an error`,
        { originalError: error, handlerError },
      )
    }

    return httpErrorResponse(error)
  }

export const onListen = (
  currentListenHandler: ServerOptions['onListen'],
  protocol: string,
  serverName: string,
) =>
(addr: Deno.NetAddr) => {
  logger.success(
    `${serverName} server is running at ${protocol}://${addr.hostname}:${addr.port}`,
  )
  try {
    currentListenHandler?.(addr)
  } catch { /** ignore */ }
}
