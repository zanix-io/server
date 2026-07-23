# Getting Started

This guide walks through building and running a minimal REST server with **Zanix Server**. For
installation and import details, see the [README](../README.md#installation).

## 1. Define a controller

Controllers group related routes. A controller class must extend `ZanixController` and be decorated
with `@Controller`; its methods become routes when decorated with `@Get`, `@Post`, `@Patch`, `@Put`,
`@Delete`, or `@Request`.

```ts
import { Controller, Get, ZanixController } from 'jsr:@zanix/server@[version]'
import type { HandlerContext } from 'jsr:@zanix/server@[version]'

@Controller('hello')
class HelloController extends ZanixController {
  @Get()
  public sayHello(ctx: HandlerContext) {
    return { message: 'Hello from Zanix!' }
  }
}
```

## 2. Start the server

`bootstrapServers` scans every registered controller, resolver, and socket class and starts the web
servers they require (`rest`, `graphql`, `socket`). It only needs to be called once, after all your
handler modules have been imported so their decorators run.

```ts
import { bootstrapServers } from 'jsr:@zanix/server@[version]'
import './hello.controller.ts' // ensures the decorator above runs

await bootstrapServers({
  rest: { globalPrefix: '/api' },
})
```

This starts a REST server exposing `GET /api/hello`.

## 3. Where to go next

- [Handlers](./HANDLERS.md) — full guide to REST, GraphQL, and WebSocket handlers, including request
  validation with RTOs.
- [Middlewares](./MIDDLEWARES.md) — guards, pipes, interceptors, and global middleware registration.
- [Dependency Injection](./DEPENDENCY-INJECTION.md) — connectors, providers, interactors, and how
  their lifecycle (`lifetime`/`startMode`) works.
- [Configuration](./CONFIGURATION.md) — default ports, constants, and environment variables.
- [Error Handling](./ERRORS.md) — how errors are logged, serialized, and returned to clients.
- [Utilities Reference](./UTILITIES.md) — routing, compression, and target-management helpers.

## Advanced: manual server control

`bootstrapServers` is the recommended entry point, but you can manage individual servers directly
through the `webServerManager` singleton — useful for custom handlers or ad-hoc scripts that don't
go through controllers/resolvers.

```ts
import { webServerManager } from 'jsr:@zanix/server@[version]'

// create() returns a ServerID — use it (not the server type string) for every other call
const serverId = webServerManager.create('rest', { handler: () => new Response('Hello World') })

webServerManager.start(serverId)
webServerManager.info(serverId) // { addr, protocol, type }
await webServerManager.stop(serverId)
webServerManager.delete(serverId)
```
