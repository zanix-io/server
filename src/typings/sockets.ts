/**
 * The native `WebSocket` event-handler property names that `ZanixWebSocket` deliberately
 * omits from its own public `socket` getter/setter type.
 *
 * `ZanixWebSocket` wires `onmessage` (and exposes `onerror`/`onopen`/`onclose` as protected,
 * overridable methods) itself as part of its own lifecycle, so the underlying `WebSocket`
 * instance exposed via the protected `socket` accessor is typed as
 * `Omit<WebSocket, SocketEvents>` to prevent consumers from bypassing that lifecycle by
 * reassigning these handlers directly on the raw socket.
 */
export type SocketEvents = 'onerror' | 'onopen' | 'onmessage' | 'onclose'
