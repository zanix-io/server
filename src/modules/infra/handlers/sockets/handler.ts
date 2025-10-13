import type { ZanixWebSocket } from './base.ts'
import type { RtoTypes } from '@zanix/types'

import { baseErrorResponses } from 'modules/webserver/helpers/errors.ts'
import { routeOnEnd, routeOnStart } from 'utils/routes.ts'
import Program from 'modules/program/main.ts'
import { HttpError } from '@zanix/errors'
import logger from '@zanix/logger'

const catcher = async (socket: WebSocket, callback: () => unknown) => {
  try {
    let response
    const cb = callback()
    if (cb instanceof Promise) response = await cb
    else response = cb
    return response
  } catch (e) {
    logger.error('An error ocurred on socket', e)
    socket.send(baseErrorResponses(e))
  }
}

export const socketHandler: (rto: RtoTypes) => HandlerFunction = (rto) =>
  function (this: ZanixWebSocket, ctx) {
    if (ctx.req.headers.get('Upgrade') === 'websocket') {
      const { socket, response } = Deno.upgradeWebSocket(ctx.req)

      this.context = ctx

      this.socket = socket

      socket.onopen = (event) => {
        routeOnStart(Program)(ctx)
        return catcher(socket, () => this['onopen'](event))
      }

      socket.onerror = (event) => {
        return catcher(socket, () => this['onerror'](event))
      }

      socket.onmessage = (event) => {
        try {
          ctx.payload.body = JSON.parse(event.data)
        } catch {
          const error = new HttpError('BAD_REQUEST', {
            message: `"${event.data}" should be a valid JSON`,
          })

          return socket.send(baseErrorResponses(error))
        }

        return catcher(socket, async () => {
          if (rto) await this.requestValidation(rto, ctx)
          return this['onmessage'](event)
        })
      }

      socket.onclose = (event) => {
        routeOnEnd(Program)(ctx)
        return catcher(socket, () => this['onclose'](event))
      }

      return response
    }
    throw new HttpError('METHOD_NOT_ALLOWED')
  }
