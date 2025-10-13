type WebServerTypes =
  | 'static'
  | 'graphql'
  | 'rest'
  | 'socket'
  | 'admin'
  | 'custom'

type ServerManagerData = Record<
  WebServerTypes,
  {
    _start: () => void
    stop: () => void | Promise<void>
    addr?: Deno.NetAddr
    protocol?: string
  }
>

type ServerHandler = Deno.ServeHandler<Deno.NetAddr>

type ServerOptions = (Deno.ServeTcpOptions | (Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem)) & {
  onceStop?: () => void
}

type ServerManagerOptions<T extends WebServerTypes> = {
  handler?: ServerHandler
  server?: T extends 'graphql' | 'rest' ? { globalPrefix?: string } & ServerOptions
    : ServerOptions
}
