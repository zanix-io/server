import { assert } from '@std/assert/assert'
import { assertEquals } from '@std/assert/assert-equals'
import Program from 'modules/program/mod.ts'
import {
  defineResolverDecorator,
  defineResolverRequestDecorator,
} from 'modules/infra/handlers/graphql/decorators/assembly.ts'
import { ZanixResolver } from 'modules/infra/handlers/graphql/base.ts'
import { rootValue } from 'modules/infra/handlers/graphql/handler.ts'
import { asyncContext } from 'modules/infra/base/storage.ts'
import type { HandlerContext } from 'typings/context.ts'

console.error = () => {}

Deno.test({
  name: 'defineResolverDecorator: a guard short-circuit returns its response directly',
  fn: async () => {
    class GuardedResolver extends ZanixResolver {
      public hello() {
        throw new Error('handler should not run')
      }
    }

    Program.middlewares.addGuard(() => ({ response: new Response('blocked') }), {
      Target: GuardedResolver,
      propertyKey: 'hello',
    })

    defineResolverRequestDecorator('Query', { name: 'hello' })(GuardedResolver.prototype.hello)
    defineResolverDecorator()(GuardedResolver as never)

    const context = { id: 'ctx-guard', payload: { body: {} } } as unknown as HandlerContext
    const request = { context } as never

    const callHello = rootValue['hello'] as unknown as (
      payload: unknown,
      request: unknown,
    ) => Promise<unknown>
    const result = await callHello(undefined, request)

    assertEquals(result, 'blocked')
    assert((request as { response?: Response }).response instanceof Response)
  },
})

Deno.test({
  name: 'defineResolverDecorator: enableALS wraps the resolver in an ALS context',
  fn: async () => {
    class AlsResolver extends ZanixResolver {
      public hello() {
        return asyncContext.getId()
      }
    }

    defineResolverRequestDecorator('Query', { name: 'hello' })(AlsResolver.prototype.hello)
    defineResolverDecorator({ enableALS: true })(AlsResolver as never)

    const context = { id: 'ctx-als', payload: { body: {} } } as unknown as HandlerContext
    const request = { context } as never

    const callHello = rootValue['hello'] as unknown as (
      payload: unknown,
      request: unknown,
    ) => Promise<unknown>
    const result = await callHello(undefined, request)

    assertEquals(result, 'ctx-als')
  },
})
