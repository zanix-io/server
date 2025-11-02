import type { ProcessedRoutes } from 'typings/router.ts'
import { HttpError } from '@zanix/errors'

/**
 * Function to clean routes
 *
 * @param route - The route path
 *
 * @example
 * ```ts
 * cleanRoute("///folder1/folder2//file") // should return /folder1/folder2/file
 * ```
 */
export function cleanRoute(route: string) {
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

/** Function to get param names form string */
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
 * @param processedRoutes
 * @param path
 * @returns
 */
export const findMatchingRoute = (processedRoutes: ProcessedRoutes, path: string) => {
  for (const key in processedRoutes) {
    const route = processedRoutes[key]
    const match = route.regex.exec(path)

    if (match) {
      return { route, match }
    }
  }
}
