import type { ServerOptions } from 'typings/server.ts'

import { errorResponses } from './errors.ts'
import logger from '@zanix/logger'

export const onErrorListener =
  (currentErrorHandler: ServerOptions['onError'], serverName: string) =>
  async (error: unknown): Promise<Response> => {
    logger.error(`An error ocurred on ${serverName} server`, error)

    try {
      const response = await currentErrorHandler?.(error)
      if (response) return response
    } catch { /** ignore */ }

    return errorResponses(error)
  }

export const onListen =
  (currentListenHandler: ServerOptions['onListen'], protocol: string, serverName: string) =>
  (addr: Deno.NetAddr) => {
    logger.success(`${serverName} server is running at ${protocol}://${addr.hostname}:${addr.port}`)
    try {
      currentListenHandler?.(addr)
    } catch { /** ignore */ }
  }
