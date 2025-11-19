import { assertThrows } from '@std/assert/assert-throws'
import { getTargetKey } from 'utils/targets.ts'
import ProgramModule from 'modules/program/mod.ts'
import { ZanixInteractor } from 'modules/infra/interactors/base.ts'

class OtherInteractor extends ZanixInteractor {
  public v = 3
}

Deno.test('ZanixInteractor: should interact return a freeze instance', () => {
  ProgramModule.targets.defineTarget(getTargetKey(OtherInteractor), {
    Target: OtherInteractor,
    type: 'interactor',
    lifetime: 'TRANSIENT',
  })

  const result = ProgramModule.targets.getInteractor<OtherInteractor>(
    getTargetKey(OtherInteractor),
  )

  assertThrows(() => {
    result.v = 6
  })
})
