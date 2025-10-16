import type { ClassConstructor } from 'typings/targets.ts'

export const getTargetKey = (target?: ClassConstructor | { name: string }) => {
  const key = target?.name || ''

  if (key.startsWith('_Zanix')) {
    throw new Deno.errors.Interrupted(
      `Class names starting with '_Zanix' are reserved and cannot be used. Please choose a different class name.`,
    )
  }
  return key
}
