export const getTargetKey = (target?: ClassConstructor) => {
  return target?.name || ''
}
