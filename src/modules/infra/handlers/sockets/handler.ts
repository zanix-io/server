import type { HandlerFunction } from 'typings/router.ts'
import type { ZanixWebSocket } from './base.ts'
import type { RtoTypes } from '@zanix/types'
import type { HandlerContext } from '@zanix/server'

import { getSerializedErrorResponse, logServerError } from 'modules/webserver/helpers/errors.ts'
import { cleanUpPipe, contextSettingPipe } from 'middlewares/defaults/context.pipe.ts'
import { HttpError } from '@zanix/errors'

const catcher = async (
  ctx: HandlerContext,
  socket: WebSocket,
  event: Event,
  callback: () => unknown,
) => {
  try {
    let response
    const cb = callback()
    if (cb instanceof Promise) response = await cb
    else response = cb
    return response
  } catch (e) {
    logServerError(e, {
      message: 'An error occurred on socket',
      meta: { event: event.type },
      code: 'SOCKET_ERROR',
    })
    socket.send(getSerializedErrorResponse(e, ctx.id))
  }
}

export const socketHandler: (rto: RtoTypes) => HandlerFunction = (rto) =>
  function (this: ZanixWebSocket, ctx) {
    if (ctx.req.headers.get('Upgrade') === 'websocket') {
      const { socket, response } = Deno.upgradeWebSocket(ctx.req)

      this.context = ctx

      this.socket = socket

      socket.onopen = (event) => {
        contextSettingPipe(this.context) // preserve the request context while socket is connected
        return catcher(this.context, socket, event, () => this.onopen(event))
      }

      socket.onerror = (event) => {
        return catcher(this.context, socket, event, () => this.onerror(event))
      }

      socket.onmessage = (event) => {
        try {
          this.context.payload.body = JSON.parse(event.data)
        } catch {
          const error = new HttpError('BAD_REQUEST', {
            message: `"${event.data}" should be a valid JSON`,
          })

          return socket.send(getSerializedErrorResponse(error, this.context.id))
        }

        return catcher(this.context, socket, event, async () => {
          if (rto) await this.requestValidation(rto, this.context)
          return this['onmessage'](event)
        })
      }

      socket.onclose = async (event) => {
        await cleanUpPipe(this.context)
        return catcher(this.context, socket, event, () => this.onclose(event))
      }

      return response
    }
    throw new HttpError('METHOD_NOT_ALLOWED')
  }
