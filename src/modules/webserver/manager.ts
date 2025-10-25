import type {
  ServerID,
  ServerManagerData,
  ServerManagerOptions,
  WebServerTypes,
} from 'typings/server.ts'

import { capitalize, fileExists, generateBasicUUID } from '@zanix/helpers'
import { getMainHandler } from './helpers/handler.ts'
import { onErrorListener, onListen } from './helpers/listeners.ts'
import ProgramModule from 'modules/program/mod.ts'
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

    // TODO: review for downloading ssl files on web using these paths
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
   * private getEnvPort
   * @param type
   * @param port
   * @returns
   */
  private getEnvPort = (type: WebServerTypes) => {
    const portValue = Deno.env.get(`PORT_${type.toUpperCase()}`) || Deno.env.get('PORT')

    if (!portValue) return

    return Number(portValue)
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
    options: ServerManagerOptions = {},
  ): ServerID {
    const serverID = `${new TextEncoder().encode(type).toHex()}${generateBasicUUID()}` as ServerID

    if (this.#servers[serverID]) return serverID

    const {
      isInternal,
      server: { onceStop, globalPrefix, ssl, ...opts } = {},
      handler = getMainHandler(type, isInternal ? serverID : globalPrefix),
    } = options
    const { onListen: currentListenHandler, onError: currentErrorHandler } = opts

    // Port assignment
    opts.port = this.getEnvPort(type) || opts.port || 8000 //default port

    if (!this.#sslOptions && ssl) this.#sslOptions = { cert: ssl.cert, key: ssl.key }

    // Protocol assignment
    const protocol = this.#sslOptions.cert ? 'https' : 'http'

    // Ssl assignment
    Object.assign(opts, { ...this.#sslOptions })

    // Listener assignment
    const serverName = capitalize(type)
    opts.onListen = onListen(currentListenHandler, protocol, serverName)
    opts.onError = onErrorListener(currentErrorHandler, serverName)

    const currentServers = this.#servers
    currentServers[serverID] = {
      _start() {
        try {
          const server = Deno.serve(opts, handler)
          this.addr = server.addr

          server.finished.then(() => {
            onceStop?.()
          })
          // overriding stop function
          this.stop = () =>
            server.shutdown().finally(() => {
              logger.info(`${serverName} server is finished`)
            })
        } catch (error) {
          const serverInUse = Object.entries(currentServers).find(([_, server]) =>
            server?.addr?.port === opts.port
          )

          if (serverInUse?.[1]) {
            const addInUseType = serverInUse[1].type.toUpperCase()
            ;(error as Error).message += isInternal
              ? ` by an internal ${addInUseType} server.`
              : ` by ${addInUseType} server with ID ${serverInUse[0]}.`
            throw new Deno.errors.Interrupted(
              `Port ${opts.port} is already in use and cannot be assigned to the ${this.type.toUpperCase()} server with ID ${serverID}. Please choose a different port.`,
              { cause: error },
            )
          }

          throw new Deno.errors.Interrupted(`An error ocurred on ${serverName} server`, {
            cause: error,
          })
        }
      },
      stop: () => {},
      protocol,
      type,
    }

    return serverID
  }

  /**
   * Returns info such as address and protocol (`http` or `https`) of the specified server.
   *
   * @param {ServerID} id - The identificator of the server.
   * @returns {{ addr?: Deno.NetAddr | undefined; protocol?: string }} The server's address and protocol, or `undefined` if the server does not exist.
   */
  public info(
    id: ServerID,
  ): Readonly<Pick<ServerManagerData[never], 'addr' | 'protocol' | 'type'>> {
    const server = this.#servers[id] || ({} as ServerManagerData[never])

    return Object.freeze({ addr: server.addr, protocol: server.protocol, type: server.type })
  }

  /**
   * Starts the specified web server if it is not already running.
   *
   * @param {ServerID} id - The identifier of the server to start.
   */
  public start(id: ServerID | ServerID[]): void {
    const processor = (callback: () => void) => {
      callback() // main function to execute
      // Delete unused references once the server has started
      ProgramModule.cleanupMetadata()
    }

    if (typeof id === 'string') return processor(() => this.#start(id))

    processor(() => {
      for (const key of id) this.#start(key)
    })
  }

  /**
   * Stops the specified web server.
   *
   * @param {ServerID} id - The identificator of the server to stop.
   * @returns {Promise<void>} A promise that resolves when the server has been stopped.
   */
  public async stop(id: ServerID | ServerID[]): Promise<void> {
    if (typeof id === 'string') return this.#servers[id]?.stop()

    await Promise.all(id.map((key) => this.#servers[key]?.stop()))
  }

  /**
   * Deletes the specified web server from the manager.
   *
   * @param {ServerID} id - The identificator of the server to delete.
   */
  public delete(id: ServerID | ServerID[]): boolean {
    if (typeof id === 'string') return delete this.#servers[id]

    for (const key of id) delete this.#servers[key]
    return true
  }
}
