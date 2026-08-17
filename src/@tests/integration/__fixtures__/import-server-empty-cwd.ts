// Regression fixture for the `zanix new` silent-failure bug: importing `@zanix/server` used to
// eagerly run `readConfig()` (see `handlers/graphql/schema.ts`) at module load time, which throws
// when `Deno.cwd()` has no `deno.json`/`.jsonc` — exactly the case for a project being scaffolded
// from scratch. Run from an empty `cwd` by the integration test alongside this file.
import '@zanix/server'

// deno-lint-ignore deno-zanix-plugin/no-znx-console
console.log('IMPORTED_OK')
