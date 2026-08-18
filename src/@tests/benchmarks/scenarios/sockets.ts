// deno-coverage-ignore-file

/**
 * The WebSocket handler path — the part of it that can be measured honestly in-process.
 *
 * ### What is measured, and what deliberately is not
 *
 * `socketHandler` (`handlers/sockets/handler.ts`) splits into two halves. The **upgrade** half
 * calls `Deno.upgradeWebSocket(ctx.req)`, which needs a real hijackable connection from
 * `Deno.serve` — it cannot run against a synthetic `Request`, and standing up a real loopback
 * server to reach it would measure the kernel's socket path, not this package. That handshake is
 * therefore NOT benchmarked here, on purpose; it is covered functionally by
 * `src/@tests/functional/sockets.test.ts`.
 *
 * The **per-message** half is the one that actually runs at frequency in a socket server, and it
 * is entirely reachable: `ZanixWebSocket`'s constructor wires a reply wrapper around the
 * consumer's own `onmessage` (serializing whatever it returns and sending it), and `socket` is a
 * settable protected property, so a concrete subclass with a stub socket exercises exactly the
 * code a real connection would — minus the transport. That, plus the non-WebSocket rejection path,
 * is what this file covers.
 *
 * The fixture subclass overrides `onmessage` rather than calling the base implementation, which is
 * both what a real consumer does (the base only logs) and what keeps a logger call out of the
 * measured region.
 *
 * @module
 */
import type { Scenario } from '../setup.ts'
import type { HandlerContext } from 'typings/context.ts'
import type { RtoTypes } from '@zanix/types'

import { ZanixWebSocket } from 'handlers/sockets/base.ts'
import { socketHandler } from 'handlers/sockets/handler.ts'

import { makeContext, makePayload, makeRequest } from '../fixtures.ts'
import { PAYLOAD_SIZES, type SizeLabel } from '../setup.ts'

/**
 * Deterministic facts about one delivered message, returned BY the scenario itself: how many
 * frames the reply wrapper actually sent, and how many bytes the last one carried.
 *
 * This is what makes the socket scenarios falsifiable. A wrapper that stopped serializing and
 * sending would not fail — it would get FASTER, and a timing-only benchmark would read that as an
 * improvement. `src/@tests/performance/validity.ts` asserts these counts instead. Same pattern as
 * the streaming time-to-first-byte scenarios, and the same reasoning: one small object per
 * iteration against a `JSON.stringify` of up to 1000 items is far below the noise floor.
 */
export interface SentFrameFacts {
  /** Frames the reply wrapper sent for this message. */
  sent: number
  /** Byte length of the last frame sent, or 0 if none. */
  bytes: number
}

/** A stub standing in for the upgraded connection, recording what the reply wrapper sends.
 * `ZanixWebSocket.socket` is typed as `Omit<WebSocket, 'onclose' | 'onerror' | 'onopen' |
 * 'onmessage'>`, and the wrapper only ever calls `send` — so this is the whole surface the
 * measured path touches. */
function stubSocket(facts: SentFrameFacts): WebSocket {
  return {
    send: (data: string) => {
      facts.sent++
      facts.bytes = data.length
    },
    readyState: 1,
    close: () => {},
  } as unknown as WebSocket
}

/** Per-instance reply payloads — see {@linkcode BenchSocket}'s constructor for why these live
 * outside the instance. */
const replies = new WeakMap<ZanixWebSocket, Record<string, unknown> | null>()

/** A concrete `ZanixWebSocket` shaped like a real consumer's: it overrides `onmessage` with its
 * own handler and returns a payload, which is what makes the constructor's reply wrapper (the code
 * actually being measured) do its work. */
class BenchSocket extends ZanixWebSocket {
  /**
   * What this socket's own `onmessage` answers with. Held in a module-level `WeakMap` rather than
   * as a field, because `ZanixWebSocket` declares a string index signature over its own handler
   * type — any extra instance property would have to satisfy it, which a plain payload cannot.
   */
  /** Mutated by the stub socket on every frame sent — reset per delivery, see
   * {@linkcode deliver}. */
  readonly #facts: SentFrameFacts = { sent: 0, bytes: 0 }

  constructor(context: HandlerContext, reply: Record<string, unknown> | null) {
    super(context)
    replies.set(this, reply)
    this.socket = stubSocket(this.#facts)
  }

  /** The public entry point — `onmessage` itself is protected, and the instance property the
   * constructor installed over it is the wrapper this benchmark exists to measure. Returns what
   * the wrapper actually did, so the scenario can be proven to still be doing it. */
  public deliver(event: MessageEvent): SentFrameFacts {
    this.#facts.sent = 0
    this.#facts.bytes = 0
    this.onmessage(event)
    return this.#facts
  }

  protected override onmessage(
    _event: MessageEvent,
  ): void | Record<string, unknown> {
    return replies.get(this) ?? undefined
  }
}

/** Builds the socket scenarios. See {@linkcode createContextScenarios} for why this is a
 * factory. */
export function createSocketScenarios(): Scenario[] {
  const context = makeContext(makeRequest('/socket'))

  // A message event per payload size, built once — parsing the inbound frame is `JSON.parse` on
  // Deno's side of the upgrade, already covered by the body-parsing scenarios.
  const event = new MessageEvent('message', { data: '{"op":"ping"}' })

  const sockets = {} as Record<SizeLabel, BenchSocket>
  for (const size of Object.keys(PAYLOAD_SIZES) as SizeLabel[]) {
    sockets[size] = new BenchSocket(
      context,
      makePayload(size) as unknown as Record<string, unknown>,
    )
  }
  const silentSocket = new BenchSocket(context, null)

  // `socketHandler` on a request that is NOT a WebSocket upgrade — the rejection path, which is
  // the only part of the handler reachable without a real connection.
  const handler = socketHandler(undefined as unknown as RtoTypes)
  const plainRequestContext = makeContext(makeRequest('/socket'))

  const scenarios: Scenario[] = [
    {
      key: 'sockets:reject:non-upgrade',
      name: 'socketHandler() — non-WebSocket request rejected (METHOD_NOT_ALLOWED)',
      group: 'sockets',
      baseline: true,
      run: () => {
        try {
          return handler.call(silentSocket as never, plainRequestContext)
        } catch (error) {
          return error
        }
      },
    },
    {
      // The wrapper's own early exit: a handler that returns nothing sends nothing. The floor for
      // every message a socket server processes without replying.
      key: 'sockets:message:no-reply',
      name: 'onmessage wrapper — handler returns nothing, no frame sent',
      group: 'sockets',
      run: () => silentSocket.deliver(event),
    },
  ]

  for (const size of Object.keys(PAYLOAD_SIZES) as SizeLabel[]) {
    scenarios.push({
      key: `sockets:message:reply:${size}`,
      name: `onmessage wrapper — serialize + send a ${size} reply (${PAYLOAD_SIZES[size]} items)`,
      group: 'sockets',
      run: () => sockets[size].deliver(event),
    })
  }

  return scenarios
}
