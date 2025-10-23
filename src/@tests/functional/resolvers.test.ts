// deno-lint-ignore-file no-explicit-any
import './setup/mod.ts'

import { assert, assertEquals } from '@std/assert'
import { GQL_PORT } from './setup/mod.ts'
import ProgramModule from 'modules/program/mod.ts'

const gqlUrl = `http://0.0.0.0:${GQL_PORT}/gql`

Deno.test('Verifying resolver gql Hello and Hello3 query', async () => {
  const query = await fetch(gqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
      query Hello {
        hello(data: { name: "ismael" }, value: "value param")
      }
    `,
    }),
  })
  const response = await query.json()

  assertEquals(response, {
    data: {
      hello: {
        message: 'Hello ismaelwelcome to GQL',
        info: {
          params: 'value param',
          interactorMessage: 'interactor D message',
          searchParam: 'GQL Pipe search param',
          searchParamByGlobalMidGql: 'param value interactor D message',
        },
      },
    },
  })

  const query2 = await fetch(gqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
      query Hello3 {
        hello3 {
          searchParam3
          searchParam
        }
      }
    `,
    }),
  })

  const response2 = await query2.json()

  assertEquals(response2, {
    data: {
      hello3: {
        searchParam: 'GQL Pipe search param',
        searchParam3: 'GQL Pipe search param for hello3',
      },
    },
  })

  const query3 = await fetch(gqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
      query Hello3 {
        hello3 {
          searchParam
        }
      }
    `,
    }),
  })

  const response3 = await query3.json()

  assertEquals(response3, {
    data: {
      hello3: {
        searchParam: 'GQL Pipe search param',
      },
    },
  })
})

Deno.test('Verifying bad request on resolver gql Hello query', async () => {
  const query = await fetch(gqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
      query Hello {
        hello(data: {}, value: "value param")
      }
    `,
    }),
  })

  const response = await query.json()

  assertEquals(response, {
    errors: [
      {
        message: 'Argument "data" has invalid value {}.',
        locations: [{ line: 3, column: 21 }],
        path: ['hello'],
      },
    ],
    data: { hello: null },
  })
})

Deno.test('Verifying resolver gql Hello2, Hello4 and 5 query', async () => {
  const query = await fetch(gqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
      query Hello2 {
        welcomeHello2
      }
    `,
    }),
  })
  const response = await query.json()

  const contextId = response.data.welcomeHello2.currentMessage.contextId
  delete response.data.welcomeHello2.currentMessage.contextId

  assert(contextId)
  assert(!ProgramModule.context.getContext(contextId).id) // context should be deleted

  assertEquals(response, {
    data: {
      welcomeHello2: {
        message: 'hello intercepted',
        currentMessage: {
          message: 'Hello 2 welcome',
          searchParam2: 'GQL Pipe search param for hello2',
        },
      },
    },
  })
  assert(!query.headers.get('global-header')) // local interceptor does not send this header

  const query4 = await fetch(gqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
      query Hello4 {
        welcomeHello4
      }
    `,
    }),
  })
  const response4 = await query4.json()
  assertEquals(query4.headers.get('global-header'), 'global interceptor header')

  assertEquals(response4, {
    data: { welcomeHello4: 'Hello 4 ' },
  })

  const query5 = await fetch(gqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
      query Hello5 {
        welcomeHello5
      }
    `,
    }),
  })
  const response5 = await query5.json()
  assertEquals(query5.headers.get('global-header'), 'global interceptor header')

  assertEquals(response5, { data: { welcomeHello5: 'Hello 5' } })
})

Deno.test('Validate schema on gql server', async () => {
  const introspectionQuery = `
  query IntrospectionQuery {
    __schema {
      types {
        name
        kind
        description
        fields {
          name
        }
      }
    }
  }
`

  const res = await fetch(gqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: introspectionQuery }),
  })

  const data = await res.json()

  // Custom types
  assert(data.data.__schema.types.some((item: any) =>
    JSON.stringify(item) === JSON.stringify({
      'name': 'Unknown',
      'kind': 'SCALAR',
      'description': 'The `Unknown` type is a custom type for generic returning values.',
      'fields': null,
    })
  ))

  // Defined types
  assert(data.data.__schema.types.some((item: any) =>
    JSON.stringify(item) === JSON.stringify({
      'name': 'InputData',
      'kind': 'INPUT_OBJECT',
      'description': 'Input Data comment',
      'fields': null,
    })
  ))

  // Queries
  assert(data.data.__schema.types.some((item: any) =>
    JSON.stringify(item) === JSON.stringify({
      'name': 'Query',
      'kind': 'OBJECT',
      'description':
        "Queries in '@zanix/server' GraphQL schema serve as operations for retrieving data from the server.\nThey facilitate read operations, allowing clients to request specific information without altering the server's state.\nQueries enable access to structured data defined within '@zanix/server' and are instrumental in fetching relevant information for client applications.",
      'fields': [
        {
          'name': 'hello3',
        },
        {
          'name': 'hello',
        },
        {
          'name': 'welcomeHello2',
        },
        {
          'name': 'welcomeHello4',
        },
        {
          'name': 'welcomeHello5',
        },
      ],
    })
  ))

  // Defaul Mutation
  assert(data.data.__schema.types.some((item: any) =>
    JSON.stringify(item) === JSON.stringify({
      'name': 'Mutation',
      'kind': 'OBJECT',
      'description':
        "Mutations in '@zanix/server' GraphQL schema represent operations for modifying data on the server.\nThey empower clients to perform write operations, enabling the creation, updating, or deletion of data within '@zanix/server'.\nMutations are pivotal in altering the server's state, ensuring clients can modify the underlying data as necessary.",
      'fields': [
        {
          'name': '_zanixMutation',
        },
      ],
    })
  ))
})
