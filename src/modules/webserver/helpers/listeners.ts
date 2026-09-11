import type { ServerOptions } from 'typings/server.ts'

import { httpErrorResponse, logAppError } from 'utils/errors/helper.ts'
import { getHeadersFromError } from 'utils/errors/request-context.ts'
import logger from '@zanix/logger'

/**
 * This is the ONE terminal `Response`-building site for an error that escaped `mainGuard`'s own
 * guard loop or a custom `routerPipe` throw (see `mainProcess`'s own doc, `webserver/helpers/
 * handler.ts`, for exactly which two phases these are) — every server type funnels here via
 * `Deno.serve`'s own `onError` (`manager.ts`). Without reading back whatever
 * {@link getHeadersFromError} finds, the final `httpErrorResponse(error)` fallback below would carry
 * NO headers at all, including `corsGuard`'s own `Access-Control-Allow-Origin`/`Vary` — a real
 * cross-origin browser would report a bare CORS failure over what's actually a normal denial
 * (a rate limit, a permission check, any consumer guard/pipe that denies by throwing instead of
 * returning `{ response }`), masking the real status entirely. This does NOT extend to a CONSUMER's
 * own `currentErrorHandler` response below — a consumer that supplies its own `onError` is already
 * choosing to build its own `Response` from scratch, and can read `getHeadersFromError(error)`
 * itself if it wants the same headers merged in, the same voluntary-adoption model
 * `getRequestFromError` already establishes for the request itself.
 */
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

    const headers = getHeadersFromError(error)
    return httpErrorResponse(error, { headers: headers ? Object.fromEntries(headers) : undefined })
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
