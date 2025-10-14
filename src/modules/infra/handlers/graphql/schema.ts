import type { ResolverTypes } from 'typings/decorators.ts'

import { defineScalars, getGqlTypes, scalarTypes } from './types.ts'
import { readConfig } from '@zanix/helpers'
import { buildSchema } from 'graphql'

const fileConfig = readConfig()

export const gqlSchemaDefinitions = {
  Query: '',
  Mutation: '',
  Type: getGqlTypes(),
}

const defaultResolver = (type: ResolverTypes) => {
  return `\n"""\nThis ${type} example serves as a demostration and does not perform any specific actions or operations. Its purpose is to showcase the structure or syntax of a GraphQL ${type} without executing any functional logic or producing a meaningful output.\n"""\n_zanix${type}: ${scalarTypes.unknown.name}`
}

export const defineSchema = () => {
  if (gqlSchemaDefinitions.Query === '') gqlSchemaDefinitions.Query = defaultResolver('Query')
  if (gqlSchemaDefinitions.Mutation === '') {
    gqlSchemaDefinitions.Mutation = defaultResolver('Mutation')
  }

  const Queries =
    `"""\nQueries in '${fileConfig.name}' GraphQL schema serve as operations for retrieving data from the server.\nThey facilitate read operations, allowing clients to request specific information without altering the server's state.\nQueries enable access to structured data defined within '${fileConfig.name}' and are instrumental in fetching relevant information for client applications.\n"""\ntype Query {${gqlSchemaDefinitions.Query}\n}`
  const Mutations =
    `"""\nMutations in '${fileConfig.name}' GraphQL schema represent operations for modifying data on the server.\nThey empower clients to perform write operations, enabling the creation, updating, or deletion of data within '${fileConfig.name}'.\nMutations are pivotal in altering the server's state, ensuring clients can modify the underlying data as necessary.\n"""\ntype Mutation {${gqlSchemaDefinitions.Mutation}\n}`

  const schema = buildSchema(`${gqlSchemaDefinitions.Type}\n${Queries}\n${Mutations}`)

  defineScalars(schema)

  return schema
}
