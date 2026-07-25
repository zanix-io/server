import type { ProcessedRoutes } from 'typings/router.ts'
import { HTTPMETHODS_WITHOUT_BODY, JSON_CONTENT_HEADER } from './constants.ts'
import { cleanRoute } from '@zanix/helpers'

/** Function to get prefix */
export const getPrefix = (globalPrefix: string) => {
  const path = cleanRoute(globalPrefix)
  const end = path.indexOf('/', 1)
  return end === -1 ? path.slice(1) : path.slice(1, end)
}

/** Function to convert dynamic routes into regular expressions */
export const pathToRegex = (path: string) => {
  return new RegExp('^' + path.replace(/\/:([a-zA-Z0-9_-]+)/g, '(\/[a-zA-Z0-9_\.%-]+)') + '$') // Ensure all route paths are URL-encoded to prevent errors with special characters.
}

/** Function to get param names from string */
export const getParamNames = (route: string) => {
  const params: string[] = []
  let start = 0

  for (let i = 0; i <= route.length; i++) {
    if (i === route.length || route[i] === '/') {
      const segment = route.slice(start, i)
      if (segment.startsWith(':')) {
        // Remove leading ':' y posible '?'
        const param = segment.slice(1).replace('?', '')
        params.push(param)
      }
      start = i + 1
    }
  }

  return params
}

/** Body payload property */
export const bodyPayloadProperty = async (
  req: Request,
): Promise<unknown> => {
  let computedBody: unknown
  const method = req.method
  if (HTTPMETHODS_WITHOUT_BODY.has(method)) return computedBody

  const contentType = req.headers.get('Content-Type')

  try {
    if (contentType && contentType.includes(JSON_CONTENT_HEADER['Content-Type'])) {
      computedBody = await req.json()
    } else if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
      computedBody = await req.formData()
    }
  } catch {
    return computedBody
  }

  return computedBody
}

/**
 * A function to find a matching route by path
 * @param relativeRoutes
 * @param path
 * @returns
 */
export const findMatchingRoute = (relativeRoutes: ProcessedRoutes, path: string) => {
  for (const key in relativeRoutes) {
    const route = relativeRoutes[key]
    const match = route.regex.exec(path)

    if (match) return { route, match }
  }
}
