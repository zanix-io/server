import { assertThrows } from '@std/assert/assert-throws'
import { getTargetKey } from 'utils/targets.ts'
import { ZanixInteractor } from '@zanix/server'
import ProgramModule from 'modules/program/mod.ts'

class OtherInteractor extends ZanixInteractor {
  public v = 3
}

Deno.test('ZanixInteractor: should interact return a freeze instance', () => {
  ProgramModule.targets.toBeInstanced(getTargetKey(OtherInteractor), {
    Target: OtherInteractor,
    type: 'interactor',
  })

  const result = ProgramModule.targets.getInstance<OtherInteractor>(
    getTargetKey(OtherInteractor),
    'interactor',
  )

  assertThrows(() => {
    result.v = 6
  })
})
