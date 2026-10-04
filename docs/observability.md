# Observability

Tools for seeing what a running server does. Today: [request timing](#request-timing), a measuring
interceptor you register on purpose, for as long as you are measuring.

## Request timing

`RequestTiming` (a decorator) and `createTimingInterceptor` (a function) register an **interceptor**
that measures how long the requests that go through it take, and logs the ones that exceed the
budget you give it. The interceptor is the only thing you register: no guard, no table of routes, no
environment variable.

### It is a tool you register on purpose

Request timing is **not part of the server and does not switch on by itself**. No default pipeline
step refers to it and nothing registers it for you. It is for two moments:

- **Investigating a slowness.** A route feels slow and you want numbers.
- **Validating a change.** You made a route faster, or changed what it does, and you want to see its
  durations before and after.

Register it, measure, and **delete the registration when the measurement is over**. It is not meant
to stay. While it is not registered it has no cost and no effect on a request.

### On a handler

Put the decorator on the method you are looking into, with its budget:

```ts
import { Controller, Get, Post, RequestTiming, ZanixController } from 'jsr:@zanix/server@[version]'

@Controller('profiles')
class ProfilesController extends ZanixController {
  @Get(':id')
  @RequestTiming({ slowMs: 400 }) // logged as `getProfile`
  public getProfile(ctx: HandlerContext) {/* ... */}

  @Post()
  public create(ctx: HandlerContext) {/* ... */} // not measured: no decorator, no cost
}
```

`slowMs` is **required and has no default**: how long a route may take is a property of that route,
not something the framework can know. Without a `name` the entry is logged under the method's name.

### On a class

On a class it measures every route of the class, all under the class's name (the entry's `method`
tells a `GET` from a `POST`):

```ts
@Controller('reports')
@RequestTiming({ slowMs: 2500, name: 'reports' })
class ReportsController extends ZanixController {/* ... */}
```

The framework looks class-level middleware up through the inheritance chain, so a subclass of a
decorated class is measured too.

On a method, the decorator measures what runs before it: keep it **after** (below) the other
interceptors you want counted. Decorators apply bottom-up.

### For every route: global registration

Register the interceptor once, with a budget you choose, for every route of one or more server
types. There is no default budget here either:

```ts
import { createTimingInterceptor, registerGlobalInterceptor } from 'jsr:@zanix/server@[version]'

const timing = createTimingInterceptor({ name: 'rest', slowMs: 800 })
timing.exports = { server: ['rest'] } // optional: only this server type (every type when omitted)
registerGlobalInterceptor(timing) // before the routes are defined
```

Global middlewares are copied into each route **when the route is defined**: a route defined before
the registration does not get it. One budget for every route is a blunt tool: use it to find the
slow routes, then put `@RequestTiming` with a proper budget on the ones that matter.

### Removing it

Delete the decorator lines, or the three statements above. `createTimingInterceptor` keeps no module
state, starts no timer and adds no listener: each interceptor's cap lives in its own closure, so
nothing is left once the registration is gone.

### Options

| Option             | Default                            | What it does                                                                                                                  |
| ------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `slowMs`           | required                           | The budget in milliseconds. A request at or over it is logged at `warn`, which persists.                                      |
| `name`             | decorated name¹                    | A fixed name, logged as `handler`. Never built from the request. ¹Required in `createTimingInterceptor`.                      |
| `logAll`           | `false`                            | `false` logs only requests over budget. `true` also prints one `debug` line per request, to choose the budgets.               |
| `maxLogsPerSecond` | `10`                               | The most over-budget entries persisted per second by one interceptor. The next persisted entry reports how many were dropped. |
| `serverTiming`     | `false`                            | Adds `Server-Timing: total;dur=<ms>` to the response. Anyone who can see the response can see it.                             |
| `log`, `clock`     | shared logger, `performance.now()` | For an application's own logger, and for tests.                                                                               |

There is **no environment variable**. If you want `logAll` to come from the environment, read your
own variable and pass it: `logAll: Deno.env.get('MYAPP_TIMING') === 'all'`.

### What is measured

From the moment the request reaches the dispatcher to the moment this interceptor runs:

```
dispatcher creates the context  →  guards  →  pipes  →  handler  →  interceptors  →  [timing interceptor]
└────────────────────────────────────────────── measured ──────────────────────────────────────────────┘
```

It covers the guards, the pipes, the handler (including what builds the response: serialization, a
page's rendering), the interceptors **before** the timing one, and the reading and parsing of the
request body, which the dispatcher does after it creates the context. It does **not** cover the
response's compression, sending it, or the tail of a streamed body: it ends when the response is
ready, which is when the first byte can go out.

A request that **ends before the interceptor stage is not measured**: a guard that answers by itself
(a `401`, a `429`), a guard or pipe that throws, a handler that throws. The framework already logs
those errors with the request's context id. A handler that returns an error `Response` is measured
like any other.

**Without a valid start nothing is measured, persisted or added to the response.** If a middleware
replaced `ctx.locals` or deleted the start, or the value is not a finite number, the interceptor
hands the response back as it came: it never invents a duration.

### The start of a request: `REQUEST_STARTED_AT_LOCALS_KEY`

The dispatcher writes one value into `ctx.locals` when it creates a request's context, **before any
guard, pipe or handler runs**: the time the request reached the dispatcher, from the monotonic clock
`performance.now()`, in milliseconds. The key is exported as `REQUEST_STARTED_AT_LOCALS_KEY`
(`'requestStartedAt'`), and `ctx.locals.requestStartedAt` is typed `number | undefined`.

- **Monotonic.** Only a difference between two readings of the same clock means anything: its origin
  is unspecified, and it never jumps when the system time changes. Compare it with
  `performance.now()`, never with `Date.now()`.
- **One per request.** Concurrent requests each have their own context, so their starts never mix.
- **Plain data in `locals`.** It follows the same rules as every key there: it persists for the
  whole request because every stage reads and writes the same `locals` object, and code that
  replaces `ctx.locals` or deletes the key removes it. It is written by the dispatcher, not
  guaranteed against a middleware that does that: read it defensively.
- **It is always written**, whether or not anything uses it. Without the timing registered, the only
  observable effect is this one extra key in `locals` and a clock read per request (about 0.1 µs).

Read it from your own interceptor:

```ts
import { REQUEST_STARTED_AT_LOCALS_KEY } from 'jsr:@zanix/server@[version]'
import type { MiddlewareInterceptor } from 'jsr:@zanix/server@[version]'

export const logDuration: MiddlewareInterceptor = (ctx, response) => {
  const startedAt = ctx.locals[REQUEST_STARTED_AT_LOCALS_KEY]
  if (typeof startedAt === 'number') {
    console.log(`${ctx.req.method} took ${performance.now() - startedAt} ms`)
  }
  return response
}
```

#### Does it survive every stage?

Yes, in the pipeline as it is today. This is verified by integration tests that run the real
pipeline (`src/@tests/integration/infra/middlewares/request-started-at.test.ts`), and by breaking
the framework on purpose (a mutation test per row of the table below) to check that those tests fail
when it does not:

| Stage                                            | Receives                                                           | The start is there                        |
| ------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------- |
| Dispatcher creates the context                   | writes `locals`                                                    | written                                   |
| Global guard (`registerGlobalGuard`)             | the same context (it mutates it, never copies it)                  | yes                                       |
| Route guards, chained                            | the same context                                                   | yes, also after a guard writes other keys |
| Context pipe, route pipes                        | the same context                                                   | yes                                       |
| Global pipe (`registerGlobalPipe`)               | a shallow **copy** of the context; `locals` is the **same** object | yes                                       |
| Handler                                          | the same context                                                   | yes                                       |
| Route interceptors                               | the same context                                                   | yes                                       |
| Global interceptor (`registerGlobalInterceptor`) | a shallow copy of the context; `locals` is the same object         | yes                                       |

It holds for REST, SSR (the pages of `@zanix/space` are `'ssr'` routes, and `defineMiddleware` is
`registerGlobalGuard` scoped to `'ssr'`), and for the socket and GraphQL route types, which go
through the same dispatcher. Two things can still remove it, both visible in the code that does
them: a middleware assigning a new object to `ctx.locals` (`ctx.locals = {...}`), and one deleting
the key. The tests cover both and the timing interceptor degrades as described above.

### What is logged

A request at or over `slowMs` is logged at `warn`, which persists. Nothing under budget is
persisted. With `logAll: true`, a request under budget is printed at `debug` (never persisted) and
one over budget is logged once, at `warn`.

```
🟡 16:16:38 | ZNX-WARNING [@zanix/server]: http.request took 1.42s {
  method: "GET",
  handler: "getProfile",
  httpStatus: 200,
  contextId: "0b7c9f6e-8a52-4a43-9d6c-1f2d3c4b5a69",
  slowMs: 400,
  label: "http.request",
  durationMs: 1422.31,
  status: "ok"
}
```

The persisted record, as the logger stores it, has the same fields in `data`:

```json
{
  "level": "warn",
  "message": "http.request took 1.42s",
  "data": [{
    "method": "GET",
    "handler": "getProfile",
    "httpStatus": 200,
    "contextId": "0b7c9f6e-8a52-4a43-9d6c-1f2d3c4b5a69",
    "slowMs": 400,
    "label": "http.request",
    "durationMs": 1422.31,
    "status": "ok"
  }]
}
```

| Field             | Meaning                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `method`          | The request's HTTP method.                                                                                                 |
| `handler`         | The `name` you gave, or the decorated method's or class's name. Never the URL.                                             |
| `httpStatus`      | The status of the response.                                                                                                |
| `contextId`       | The request's context id, the one the framework's error log carries.                                                       |
| `slowMs`          | The budget that was exceeded, so a record explains itself.                                                                 |
| `durationMs`      | The measured duration in milliseconds, two decimals.                                                                       |
| `suppressed`      | Only when the cap dropped entries: how many since the last persisted one.                                                  |
| `label`, `status` | The logger's own fields. `status: "ok"` says the measurement completed, not that the request succeeded: read `httpStatus`. |

Nothing else is ever part of an entry: no URL, query string, body, header, cookie, user or session
id, or error message.

#### The cap

One interceptor persists at most `maxLogsPerSecond` over-budget entries per second. If a service is
slow everywhere, the extra entries are dropped (and, with `logAll: true`, printed at `debug`), and
the next persisted one carries `suppressed: <n>`. The cap is per interceptor: a class decorator or a
global registration is one interceptor, a decorator on each of several methods is several.

#### The logger's level

The logger's minimum level (`LOG_LEVEL` in `@zanix/utils`) applies. Over-budget entries need `warn`
and `logAll: true` lines need `debug`: when the level drops what the configuration would log, and
`serverTiming` is off, nothing is measured at all. `debug` and `success` entries never persist;
`warn` does. A project whose `zanix.project` is `library` or `app` persists nothing until a `save`
function is configured.

### `Server-Timing`

With `serverTiming: true`, every response that goes through the interceptor gets
`Server-Timing: total;dur=<ms>`, which browsers' developer tools show. It carries the total only, no
route name and no internal step, and **anyone who can see the response can see it**. A header the
application already set is kept and `total` is appended.

### The cost

- **Not registered:** nothing of the timing is in the request path. The dispatcher still writes the
  start into `locals`: one clock read (about 0.1 µs; the repo's gated lifecycle benchmarks pass).
- **Registered, route not decorated:** nothing. The interceptor is only on the routes it is
  registered on.
- **Registered:** one clock read and a comparison per request, plus the log entry when it is over
  budget (or with `logAll: true`).

### Choosing `slowMs`

There is no right number in general: a report that aggregates a year of data and a login are not
slow at the same point. To pick one:

1. Decorate the routes you care about with a generous `slowMs` and `logAll: true`.
2. Use them as you normally would and look at the `debug` lines for each: how long a route usually
   takes, and how long its slow tail takes.
3. Take the **p95** you observe, add a margin (a third to a half more), and use that as its
   `slowMs`. A light route might end up at `150`; a heavy report at `4000`.
4. Remove `logAll: true` and keep the budget: if most requests are persisted, the budget is too
   tight or the route has a real problem.

### Using it in a Space application

`@zanix/space` pages are routes of the `'ssr'` server type on the same pipeline. A page class is
decorated like any other handler class, **below** `@Page` (the same place `@Guard` goes), so
`@RequestTiming` works on a page class with no change to Space:

```tsx
@Page({ path: ':lang/profile/edit', Interactor: ProfileWebService })
@Guard(requireSession([USER_SESSION_SCOPE]))
@RequestTiming({ slowMs: 1500 }) // logged as the class's name, `ProfileEditPage`
export default class ProfileEditPage extends SpacePageController<{ lang: string }> {/* ... */}
```

The class decorator covers `handleGet` and `handlePost`; the entry's `method` tells them apart. To
measure every page, register `createTimingInterceptor` globally with `exports = { server: ['ssr'] }`
next to `defineMiddleware(...)`, before `defineSpaceApp(...)`. A page decorated this way declares
its own budget: nothing reads a static property or Space-specific setting.

What it does **not** cover on a Space application: a request answered before the pipeline (a
`preHandler`, such as the redirect that adds the language prefix), the browser's time, and the
streaming of a long page after its first byte. A page whose `loader` throws is turned into a
rendered error page by the page controller, so it is measured by its status.

### What it needs

`@zanix/utils` 4.8.0 or later: the interceptor logs through `logger.timer` and reads the logger's
`isLevelEnabled`.

## See also

- [Middlewares](./middlewares.md) — guards, pipes, interceptors, and how global ones are registered.
- [Errors](./errors.md) — how errors are logged and what reaches a client.
- [Configuration](./configuration.md) — environment variables and constants.
