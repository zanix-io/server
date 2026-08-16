// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert/assert-equals'
import { assertThrows } from '@std/assert/assert-throws'
import { assertSpyCalls, spy } from '@std/testing/mock'
import type { GuardContext } from 'typings/middlewares.ts'
import Program from 'modules/program/mod.ts'
import { defineSsrControllerDecorator } from 'modules/infra/handlers/ssr/decorators/assembly.ts'
import { ZanixSsrController } from 'modules/infra/handlers/ssr/base.ts'
import { Get } from 'modules/infra/handlers/rest/decorators/get.ts'
import { InternalError } from '@zanix/errors'
import { DEFAULT_PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER } from 'utils/constants.ts'

console.error = () => {}

class InvalidSsrController {} // Doesn't extend ZanixSsrController

Deno.test('defineSsrControllerDecorator: accepts the short string-prefix syntax', () => {
  const defineTargetSpy = spy(Program.targets, 'defineTarget')

  class MyPageController extends ZanixSsrController {}

  const decorator = defineSsrControllerDecorator('myPrefix')
  decorator(MyPageController as never)

  assertSpyCalls(defineTargetSpy, 1)
  const call = defineTargetSpy.calls[0] as any
  assertEquals(call.args[1].Target, MyPageController)
  assertEquals(call.args[1].type, 'controller')

  defineTargetSpy.restore()
})

Deno.test("defineSsrControllerDecorator: registers the route under 'ssr', not 'rest'", () => {
  Program.routes.resetContainer()

  class SsrRegistrationController extends ZanixSsrController {
    @Get(':id')
    public getProduct() {
      return 'ok'
    }
  }

  defineSsrControllerDecorator('ssr-registration')(
    SsrRegistrationController as never,
  )

  assertEquals(Program.routes.getRoutes('rest'), undefined)
  const ssrRoutes = Program.routes.getRoutes('ssr')
  assertEquals(Object.keys(ssrRoutes ?? {}).length, 1)
})

Deno.test("defineSsrControllerDecorator: throws if class doesn't extend ZanixSsrController", () => {
  const decorator = defineSsrControllerDecorator()

  assertThrows(
    () => decorator(InvalidSsrController as never),
    InternalError,
    "The class 'InvalidSsrController' is not a valid SsrController. Please extend ZanixSsrController",
  )
})

Deno.test('defineSsrControllerDecorator: versionProtocol is on by default', async () => {
  class DefaultProtocolPageController extends ZanixSsrController {}

  defineSsrControllerDecorator()(DefaultProtocolPageController as never)

  const [guard] = Program.middlewares.getGuards({
    Target: DefaultProtocolPageController as never,
  })
  const [interceptor] = Program.middlewares.getInterceptors({
    Target: DefaultProtocolPageController as never,
  })

  const locals: Record<string, unknown> = {}
  const guardResult = await guard(
    { req: new Request('http://localhost/'), locals } as GuardContext,
  )
  assertEquals(guardResult, {})

  const response = await interceptor({ locals } as never, new Response('{}'))
  assertEquals(
    response.headers.get(PROTOCOL_VERSION_HEADER),
    String(DEFAULT_PROTOCOL_VERSION),
  )
})

Deno.test('defineSsrControllerDecorator: versionProtocol: false disables it', () => {
  class NoProtocolPageController extends ZanixSsrController {}

  defineSsrControllerDecorator({ versionProtocol: false })(
    NoProtocolPageController as never,
  )

  assertEquals(
    Program.middlewares.getGuards({
      Target: NoProtocolPageController as never,
    }),
    [],
  )
  assertEquals(
    Program.middlewares.getInterceptors({
      Target: NoProtocolPageController as never,
    }),
    [],
  )
})

Deno.test('ZanixSsrController should pass context.id to HandlerGenericClass', () => {
  const context = {
    id: 'abc-123',
  } as any

  class TestController extends ZanixSsrController {
  }

  const controller = new TestController(context)

  assertEquals(controller['context'].id, context.id)
})
