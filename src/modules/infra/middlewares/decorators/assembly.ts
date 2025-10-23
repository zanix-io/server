import type { ZanixGenericDecorator } from 'typings/decorators.ts'
import type { MiddlewareInterceptor, MiddlewarePipe } from 'typings/middlewares.ts'
import type { ClassConstructor } from 'typings/targets.ts'

import ProgramModule from 'modules/program/mod.ts'

/** Define decorator to register a pipe */
export function definePipeDecorator(
  pipe: MiddlewarePipe,
): ZanixGenericDecorator {
  return function (target, context) {
    if (context?.kind === 'class') {
      ProgramModule.middlewares.addPipe(pipe, { Target: target as ClassConstructor })
    } else {
      const handler = target.name.toString()
      ProgramModule.decorators.addDecoratorData({ handler, mid: pipe }, 'pipe')
    }
  }
}

/** Define decorator to register an interceptor */
export function defineInterceptorDecorator(
  interceptor: MiddlewareInterceptor,
): ZanixGenericDecorator {
  return function (target, context) {
    if (context?.kind === 'class') {
      ProgramModule.middlewares.addInterceptor(interceptor, { Target: target as ClassConstructor })
    } else {
      const handler = target.name.toString()
      ProgramModule.decorators.addDecoratorData({ handler, mid: interceptor }, 'interceptor')
    }
  }
}

/** Appli defined middlewares to current target */
export function applyMiddlewaresToTarget(Target: ClassConstructor) {
  const pipeDecorators = ProgramModule.decorators.getDecoratorsData('pipe')
  const interceptorDecorators = ProgramModule.decorators.getDecoratorsData('interceptor')

  pipeDecorators.forEach((pipe) => {
    ProgramModule.middlewares.addPipe(pipe.mid, { Target, propertyKey: pipe.handler })
  })

  interceptorDecorators.forEach((interceptor) => {
    ProgramModule.middlewares.addInterceptor(interceptor.mid, {
      Target,
      propertyKey: interceptor.handler,
    })
  })

  ProgramModule.decorators.deleteDecorators('pipe')
  ProgramModule.decorators.deleteDecorators('interceptor')
}
