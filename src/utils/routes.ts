import type { ProcessedRoutes } from 'typings/router.ts'
import { HttpError } from '@zanix/errors'

/**
 * Normalizes and sanitizes a route path string.
 *
 * This function trims whitespace, removes extra slashes, converts backslashes
 * to forward slashes, ensures the path starts with a single `/`, and removes
 * any trailing slash. The result is also converted to lowercase.
 *
 * @param {string} route - The raw route path to clean.
 * @returns {string} A normalized route string starting with `/`.
 *
 * @example
 * ```ts
 * cleanRoute("///folder1/folder2//file")
 * // → "/folder1/folder2/file"
 *
 * cleanRoute("  \\API\\Users\\  ")
 * // → "/api/users"
 *
 * cleanRoute("")
 * // → "/"
 * ```
 */
export function cleanRoute(route: string): string {
  route = route.trim()
  route = route.replace(/\s+/g, '')
  route = route.replace(/\\/g, '/')
  route = route.replace(/\/+/g, '/')

  if (route && !route.startsWith('/')) {
    route = '/' + route
  }

  route = route.endsWith('/') ? route.slice(0, -1) : route

  return route.toLowerCase() || '/'
}

/** Function to convert dynamic routes into regular expressions */
export const pathToRegex = (path: string) => {
  return new RegExp('^' + path.replace(/\/:([a-zA-Z0-9_-]+)/g, '(\/[a-zA-Z0-9_\.%-]+)') + '$') // Ensure all route paths are URL-encoded to prevent errors with special characters.
}

/** Function to get param names from string */
export const getParamNames = (route: string) => {
  return route.split('/').filter((part) => part.startsWith(':')).map((param) =>
    param.substring(1).replace('?', '')
  )
}

/** Body payload property */
export const bodyPayloadProperty = async (
  req: Request,
): Promise<unknown> => {
  let computedBody: unknown
  if (req.method === 'POST') {
    const contentType = req.headers.get('Content-Type')

    if (contentType && contentType.includes('application/json')) {
      computedBody = await req.json()
    } else if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
      computedBody = await req.formData()
    } else {
      throw new HttpError('UNSUPPORTED_MEDIA_TYPE')
    }
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

    if (match) {
      return { route, match }
    }
  }
}
