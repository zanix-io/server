import { readConfig } from '@zanix/helpers'

/** Longest identifier `sanitizeIdentifier` ever returns. */
const MAX_IDENTIFIER_LENGTH = 64

/**
 * Sanitizes an arbitrary string into a safe, deterministic identifier: lowercased, every run of
 * non `[a-z0-9_]` characters collapsed to a single `_`, no leading/trailing `_`, capped at
 * {@link MAX_IDENTIFIER_LENGTH} characters.
 */
export const sanitizeIdentifier = (value: string, maxLength = MAX_IDENTIFIER_LENGTH): string => {
  const id = value.toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+/g, '')
    .replace(/_+$/g, '')

  return id.length > maxLength ? id.substring(0, maxLength) : id
}

/**
 * Derives a stable service identity from the project's own package name (`deno.jsonc`/`deno.json`'s
 * `name`), falling back to `'zanix_system'` when unavailable — the same convention
 * `ZanixDatabaseConnector`'s `defaultDbName` already uses for the default database name, so a
 * consumer gets one consistent "who am I" default instead of two independently-derived ones.
 */
export const getServiceId = (): string => {
  const projectName = readConfig().name

  if (!projectName) return 'zanix_system'

  return sanitizeIdentifier(projectName)
}
