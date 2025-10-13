export const processUrlParams = <T extends unknown>(obj: T): T => {
  try {
    if (typeof obj !== 'object' || obj === null) return obj

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') {
          obj[i] = decodeURIComponent(obj[i])
        } else {
          processUrlParams(obj[i])
        }
      }
    } else {
      for (const key in obj) {
        const value = obj[key as keyof typeof obj]
        if (typeof value === 'string') {
          obj[key as keyof typeof obj] = decodeURIComponent(value) as never
        } else {
          processUrlParams(value)
        }
      }
    }
  } catch {
    //ignore
  }
  return obj
}
