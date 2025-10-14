import type { ZanixGenericDecorator } from 'typings/decorators.ts'
import type { MiddlewareInterceptor, MiddlewarePipe } from 'typings/middlewares.ts'
import type { ClassConstructor } from 'typings/targets.ts'

import Program from 'modules/program/main.ts'

/** Define decorator to register a pipe */
export function definePipeDecorator(
  pipe: MiddlewarePipe,
): ZanixGenericDecorator {
  return function (target, context) {
    if (context?.kind === 'class') {
      Program.middlewares.addPipe(pipe, { Target: target as ClassConstructor })
    } else {
      const handler = target.name.toString()
      Program.decorators.addDecoratorData({ handler, mid: pipe }, 'pipe')
    }
  }
}

/** Define decorator to register an interceptor */
export function defineInterceptorDecorator(
  interceptor: MiddlewareInterceptor,
): ZanixGenericDecorator {
  return function (target, context) {
    if (context?.kind === 'class') {
      Program.middlewares.addInterceptor(interceptor, { Target: target as ClassConstructor })
    } else {
      const handler = target.name.toString()
      Program.decorators.addDecoratorData({ handler, mid: interceptor }, 'interceptor')
    }
  }
}

/** Appli defined middlewares to current target */
export function applyMiddlewaresToTarget(Target: ClassConstructor) {
  const pipeDecorators = Program.decorators.getDecoratorsData('pipe')
  const interceptorDecorators = Program.decorators.getDecoratorsData('interceptor')

  pipeDecorators.forEach((pipe) => {
    Program.middlewares.addPipe(pipe.mid, { Target, propertyKey: pipe.handler })
  })

  interceptorDecorators.forEach((interceptor) => {
    Program.middlewares.addInterceptor(interceptor.mid, {
      Target,
      propertyKey: interceptor.handler,
    })
  })

  Program.decorators.deleteDecorators('pipe')
  Program.decorators.deleteDecorators('interceptor')
}
