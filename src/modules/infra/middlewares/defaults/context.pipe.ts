import type { MiddlewarePipe } from 'typings/middlewares.ts'
import type { ScopedContext } from 'typings/context.ts'

import { processScopedPayload } from 'utils/context.ts'
import ProgramModule from 'modules/program/mod.ts'

/**
 * Middleware that sets up the initial context for a request or process.
 *
 *  1. Adds a new `ScopedContext` to the `ProgramModule.context` using the context's `id`.
 *  2. Processes the incoming payload through `processScopedPayload` before storing it.
 */
export const contextSettingPipe: MiddlewarePipe = (context) => {
  const session = Object.freeze(context.locals.session)
  context.session = { ...context.session, ...session }
  Object.freeze(context.session)
  delete context.locals.session

  ProgramModule.context.addContext<ScopedContext>({
    payload: processScopedPayload(context.payload),
    id: Object.freeze(context.id),
    locals: context.locals,
    cookies: Object.freeze(context.cookies),
    session,
  })
}

/**
 * Middleware that cleans up scoped instances and context after a request or process is done.
 *
 *  1. Deletes the `ScopedContext` associated with the current context ID.
 *  2. Resets any scoped instances stored in `ProgramModule.targets` for that context ID.
 *
 * @remarks
 * This ensures that no stale or leftover data remains after the request/process finishes.
 */
export const cleanUpPipe: MiddlewarePipe = async (context) => {
  ProgramModule.context.deleteContext(context.id)
  await ProgramModule.targets.resetScopedInstances(context.id)
}
