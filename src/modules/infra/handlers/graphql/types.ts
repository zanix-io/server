import { GraphQLScalarType, type GraphQLSchema } from 'graphql'
import { collectFiles } from '@zanix/helpers'

export const scalarTypes = {
  unknown: {
    name: 'Unknown',
    definition: new GraphQLScalarType({
      name: 'Unknown',
      description: `The \`Unknown\` type is a custom type for generic returning values.`,
      serialize: (value) => value,
    }),
  },
}

const scalars = Object.values(scalarTypes)

export const defineScalars = (schema: GraphQLSchema) => {
  for (const scalar of scalars) {
    // TODO: review this hack, could not work
    schema['_typeMap'][scalar.name] = scalar.definition
  }
}

export function getGqlTypes(dir = '.') {
  const parts: string[] = []

  // Adding scalar types
  const scalars = Object.values(scalarTypes)
  for (const scalar of scalars) {
    parts.push(`"""${scalar.definition.description}"""\nscalar ${scalar.name}\n`)
  }

  collectFiles(dir, ['.gql', '.graphql'], (_, content) => {
    parts.push(content)
  })

  return parts.join('\n')
}

export function buildGqlInput(input?: string | Record<string, string>): string {
  if (typeof input === 'string') {
    return `(input: ${input})`
  } else if (typeof input === 'object' && input !== null) {
    const entries = Object.entries(input)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ')

    return `(${entries})`
  }
  return ''
}
