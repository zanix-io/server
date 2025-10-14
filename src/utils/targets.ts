import type { ClassConstructor } from 'typings/targets.ts'

export const getTargetKey = (target?: ClassConstructor) => {
  return target?.name || ''
}
