import { RESERVED_PORTS } from 'utils/constants.ts'
import { capitalize, fileExists } from '@zanix/helpers'
import { getMainHandler } from './helpers/handler.ts'
import { onErrorListener, onListen } from './helpers/listeners.ts'
import logger from '@zanix/logger'
import Program from '../program/main.ts'

/**
 * WebServerManager is a utility class for managing web servers with optional SSL support.
 * It provides methods for creating, starting, stopping, and deleting web servers, as well as retrieving information about running servers.
 * The class allows both HTTP and HTTPS protocols, with the SSL certificate and key provided via environment variables or directly through the options parameter.
 */
export class WebServerManager {
  #servers: Partial<ServerManagerData> = {}
  #sslOptions: { key?: string; cert?: string } = {}
  private portValidation = (type: WebServerTypes) => {
    const portValue = Deno.env.get(`PORT_${type.toUpperCase()}`) || Deno.env.get('PORT')

    if (!portValue) return 8000 // default port

    const portNumber = Number(portValue)

    if (RESERVED_PORTS.includes(portNumber)) {
      throw new Deno.errors.Interrupted(`The port '${portNumber}' is reserved and cannot be used.`)
    }

    return portNumber
  }
  /**
   * Initializes the WebServerManager instance and loads ports and SSL options from environment variables (`SSL_KEY_PATH` and `SSL_CERT_PATH`).
   */
  constructor() {
    // SSL validation
    const sslKeyPath = Deno.env.get('SSL_KEY_PATH')
    const sslCertPath = Deno.env.get('SSL_CERT_PATH')

    if (sslKeyPath && sslCertPath && fileExists(sslKeyPath) && fileExists(sslCertPath)) {
      this.#sslOptions = {
        cert: Deno.readTextFileSync(sslCertPath),
        key: Deno.readTextFileSync(sslKeyPath),
      }
    }
  }

  /**
   * Private start function
   * @param serverType
   * @returns
   */
  #start(serverType: WebServerTypes) {
    const server = this.#servers[serverType]
    if (server?.addr) return
    server?._start()
  }

  /**
   * Creates a new web server with the specified name and handler.
   * If a server with the same name already exists, it returns the existing server.
   *
   * @param {WebServerTypes} type - The name of the server (e.g., "rest", "static").
   * @param {ServerManagerOptions} [options={}] - Options that include the function to handle incoming requests and configuration for the server, such as SSL options and the `onListen` callback.
   * @returns {ServerManagerData[keyof ServerManagerData]} The server data or `undefined` if a server with the same name already exists.
   */
  public create<T extends WebServerTypes>(
    type: T,
    options: ServerManagerOptions<T> = {},
  ): Omit<ServerManagerData[keyof ServerManagerData], '_start'> {
    if (this.#servers[type]) return this.#servers[type]

    const {
      server: { onceStop, ...opts } = {},
      handler = getMainHandler(
        type,
        (options as ServerManagerOptions<'graphql' | 'rest'>).server?.globalPrefix,
      ),
    } = options
    const { onListen: currentListenHandler, onError: currentErrorHandler } = opts

    if (Object.hasOwn(options, 'cert')) {
      this.#sslOptions = { cert: options['cert' as never], key: options['key' as never] }
    }

    // Protocol assignment
    const protocol = this.#sslOptions.cert ? 'https' : 'http'

    // Port assignment
    opts.port = opts.port || this.portValidation(type)

    // Ssl assignment
    Object.assign(opts, { ...this.#sslOptions })

    // Listener assignment
    const serverName = capitalize(type)
    opts.onListen = onListen(currentListenHandler, protocol, serverName)
    opts.onError = onErrorListener(currentErrorHandler, serverName)

    this.#servers[type] = {
      stop: () => {},
      _start() {
        try {
          const server = Deno.serve(opts, handler)
          this.addr = server.addr

          this.protocol = protocol
          server.finished.then(() => {
            onceStop?.()
          })
          // overriding stop function
          this.stop = () =>
            server.shutdown().finally(() => {
              logger.info(`${serverName} server is finished`)
            })
        } catch (error) {
          throw new Deno.errors.Interrupted(`An error ocurred on ${serverName} server`, {
            cause: error,
          })
        }
      },
    }

    return this.#servers[type]
  }

  /**
   * Returns info such as address and protocol (`http` or `https`) of the specified server.
   *
   * @param {WebServerTypes} type - The name of the server.
   * @returns {{ addr?: Deno.NetAddr | undefined; protocol?: string }} The server's address and protocol, or `undefined` if the server does not exist.
   */
  public info(type: WebServerTypes): { addr?: Deno.NetAddr | undefined; protocol?: string } {
    const server = this.#servers[type]
    return { addr: server?.addr, protocol: server?.protocol }
  }

  /**
   * Starts the specified web server if it is not already running.
   *
   * @param {WebServerTypes} type - The name of the server to start. If not provided, all servers will be started.
   */
  public start(type?: WebServerTypes) {
    if (type) this.#start(type)
    else {
      for (const serverType in this.#servers) {
        this.#start(serverType as WebServerTypes)
      }
    }

    // Delete unused references once the server has started
    Program.cleanupMetadata()
  }

  /**
   * Stops the specified web server.
   *
   * @param {WebServerTypes} type - The name of the server to stop.
   * @returns {Promise<void>} A promise that resolves when the server has been stopped.
   */
  public async stop(type: WebServerTypes): Promise<void> {
    await this.#servers[type]?.stop()
  }

  /**
   * Deletes the specified web server from the manager.
   *
   * @param {WebServerTypes} name - The name of the server to delete.
   */
  public delete(name: WebServerTypes) {
    delete this.#servers[name]?.addr // delete reference
    delete this.#servers[name]?.protocol // delete reference

    delete this.#servers[name]
  }
}
