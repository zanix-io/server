import type {
  ServerID,
  ServerManagerData,
  ServerManagerOptions,
  WebServerTypes,
} from 'typings/server.ts'

import { RESERVED_PORTS } from 'utils/constants.ts'
import { capitalize, fileExists, generateBasicUUID } from '@zanix/helpers'
import { getMainHandler } from './helpers/handler.ts'
import { onErrorListener, onListen } from './helpers/listeners.ts'
import Program from '../program/main.ts'
import logger from '@zanix/logger'

/**
 * WebServerManager is a utility class for managing web servers with optional SSL support.
 * It provides methods for creating, starting, stopping, and deleting web servers, as well as retrieving information about running servers.
 * The class allows both HTTP and HTTPS protocols, with the SSL certificate and key provided via environment variables or directly through the options parameter.
 */
export class WebServerManager {
  #servers: Partial<ServerManagerData> = {}
  #sslOptions: { key?: string; cert?: string } = {}

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
   * @param id
   * @returns
   */
  #start(id: ServerID) {
    const server = this.#servers[id]
    if (!server || server.addr) return
    server._start()
  }

  /**
   * private envPortValidation
   * @param type
   * @param port
   * @returns
   */
  private envPortValidation = (type: WebServerTypes, port?: number, isAdmin?: boolean) => {
    const portValue = Deno.env.get(`PORT_${type.toUpperCase()}`) || Deno.env.get('PORT') || port

    if (!portValue) return

    const portNumber = Number(portValue)

    if (!isAdmin && RESERVED_PORTS.includes(portNumber)) {
      throw new Deno.errors.Interrupted(`The port '${portNumber}' is reserved and cannot be used.`)
    }

    return portNumber
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
  ): ServerID {
    const serverID = `${new TextEncoder().encode(type).toHex()}${generateBasicUUID()}` as ServerID

    if (this.#servers[serverID]) return serverID

    const globalPrefix = (options as ServerManagerOptions<'graphql' | 'rest'>).server
      ?.globalPrefix

    const isAdmin = globalPrefix === '{{zanix-admin-server-id}}'

    const {
      server: { onceStop, ssl, ...opts } = {},
      handler = getMainHandler(type, isAdmin ? serverID : globalPrefix),
    } = options
    const { onListen: currentListenHandler, onError: currentErrorHandler } = opts

    // Port assignment
    opts.port = this.envPortValidation(type, opts.port, isAdmin) || 8000 //default port

    if (!this.#sslOptions && ssl) this.#sslOptions = { cert: ssl.cert, key: ssl.key }

    // Protocol assignment
    const protocol = this.#sslOptions.cert ? 'https' : 'http'

    // Ssl assignment
    Object.assign(opts, { ...this.#sslOptions })

    // Listener assignment
    const serverName = capitalize(type)
    opts.onListen = onListen(currentListenHandler, protocol, serverName)
    opts.onError = onErrorListener(currentErrorHandler, serverName)

    this.#servers[serverID] = {
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

    return serverID
  }

  /**
   * Returns info such as address and protocol (`http` or `https`) of the specified server.
   *
   * @param {ServerID} id - The identificator of the server.
   * @returns {{ addr?: Deno.NetAddr | undefined; protocol?: string }} The server's address and protocol, or `undefined` if the server does not exist.
   */
  public info(id: ServerID): Partial<ServerManagerData[never]> {
    const server = this.#servers[id] || ({} as ServerManagerData[never])

    return Object.freeze({ addr: server.addr, protocol: server.protocol })
  }

  /**
   * Starts the specified web server if it is not already running.
   *
   * @param {ServerID} id - The identifier of the server to start. If not provided, all servers will be started.
   */
  public start(id?: ServerID): void {
    const processor = (callback: () => void) => {
      callback() // main function to execute
      // Delete unused references once the server has started
      Program.cleanupMetadata()
    }

    if (id) return processor(() => this.#start(id))

    processor(() => {
      for (const key in this.#servers) {
        this.#start(key as ServerID)
      }
    })
  }

  /**
   * Stops the specified web server.
   *
   * @param {ServerID} id - The identificator of the server to stop.
   * @returns {Promise<void>} A promise that resolves when the server has been stopped.
   */
  public async stop(id: ServerID): Promise<void> {
    await this.#servers[id]?.stop()
  }

  /**
   * Deletes the specified web server from the manager.
   *
   * @param {ServerID} id - The identificator of the server to delete.
   */
  public delete(id: ServerID) {
    delete this.#servers[id]
  }
}
