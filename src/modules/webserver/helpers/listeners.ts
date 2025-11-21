import type { ServerOptions } from 'typings/server.ts'

import { httpErrorResponse, logServerError } from './errors.ts'
import logger from '@zanix/logger'

export const onErrorListener =
  (currentErrorHandler: ServerOptions['onError'], serverName: string) =>
  async (error: unknown): Promise<Response> => {
    logServerError(error, {
      message: `An error occurred on ${serverName} server`,
      code: 'SERVER_ERROR',
      meta: { serverName },
    })

    try {
      const response = await currentErrorHandler?.(error)
      if (response) return response
    } catch { /** ignore */ }

    return httpErrorResponse(error)
  }

export const onListen =
  (currentListenHandler: ServerOptions['onListen'], protocol: string, serverName: string) =>
  (addr: Deno.NetAddr) => {
    logger.success(`${serverName} server is running at ${protocol}://${addr.hostname}:${addr.port}`)
    try {
      currentListenHandler?.(addr)
    } catch { /** ignore */ }
  }
