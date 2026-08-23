import { assert, assertEquals } from '@std/assert'
import { buildSchema, parse, specifiedRules, validate } from 'graphql'
import { createDepthLimitRule } from 'modules/infra/handlers/graphql/handler.ts'

/**
 * Regression coverage for a confirmed risk: GraphQL requests were `execute()`d with no
 * `validate()` step at all — no depth limit, no way to disable introspection. A deeply (or, via a
 * reused fragment, exponentially) nested query is a real memory/CPU exhaustion vector.
 *
 * `createDepthLimitRule` is tested directly against `graphql-js`'s own `parse`/`validate`, rather
 * than through the full HTTP handler — the algorithm itself (does it compute the REAL depth,
 * following fragment spreads to their target's own depth) is what matters here, independent of
 * this framework's resolver/decorator wiring.
 */
const schema = buildSchema(`
  type Person {
    name: String
    friend: Person
  }
  type Query {
    me: Person
  }
`)

function depthErrors(query: string, maxDepth: number) {
  const document = parse(query)
  return validate(schema, document, [createDepthLimitRule(maxDepth)])
}

Deno.test('createDepthLimitRule: a query within the limit produces no errors', () => {
  const errors = depthErrors('{ me { friend { friend { name } } } }', 4)
  assertEquals(errors.length, 0)
})

Deno.test('createDepthLimitRule: a query one level over the limit is rejected', () => {
  // me -> friend -> friend -> name = depth 4
  const errors = depthErrors('{ me { friend { friend { name } } } }', 3)
  assertEquals(errors.length, 1)
  assert(errors[0].message.includes('too deep'))
  assert(errors[0].message.includes('exceeds the maximum allowed depth of 3'))
})

Deno.test('createDepthLimitRule: a query exactly at maxDepth is not rejected', () => {
  // me -> name = depth 2 (every field, leaf or not, is its own level; me nests one more).
  assertEquals(depthErrors('{ me { name } }', 2).length, 0)
})

Deno.test('createDepthLimitRule: one level below the real depth still rejects', () => {
  assertEquals(depthErrors('{ me { name } }', 1).length, 1)
})

/**
 * The actual point of this rule: a query can look shallow at the literal spread site while
 * resolving to real depth well past the limit, via a fragment. Counting `FragmentSpread` itself as
 * "one level" (instead of following it to the fragment's own depth) would let this exact query
 * through — proving that gap doesn't exist is the core regression this locks in.
 */
Deno.test('createDepthLimitRule: depth follows a FragmentSpread to its real depth', () => {
  const query = `
    query { me { ...F } }
    fragment F on Person { friend { friend { name } } }
  `
  // Same real depth (4) as the fully inlined query above — must be rejected the same way.
  assertEquals(depthErrors(query, 3).length, 1)
  assertEquals(depthErrors(query, 4).length, 0)
})

Deno.test('createDepthLimitRule: a fragment cycle does not infinite-loop', () => {
  // Invalid GraphQL (a real cycle) — `NoFragmentCycles` (specifiedRules) is what actually
  // reports it; this only proves the depth rule itself terminates instead of hanging.
  const query = `
    query { me { ...A } }
    fragment A on Person { friend { ...B } }
    fragment B on Person { friend { ...A } }
  `
  const document = parse(query)
  const errors = validate(schema, document, [
    ...specifiedRules,
    createDepthLimitRule(50),
  ])
  assert(errors.some((e) => e.message.includes('within itself'))) // NoFragmentCycles' own wording
})
