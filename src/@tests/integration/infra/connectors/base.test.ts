import type { ConnectionStatusHandler } from 'typings/general.ts'
import { ZanixConnector } from 'modules/infra/connectors/base.ts'
import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'

stub(console, 'error')

class Connector extends ZanixConnector {
  protected startConnection = () => true
  protected stopConnection = () => true
}

class ConnectorErrorOne extends ZanixConnector {
  protected startConnection = () => {
    throw new Error()
  }
  protected stopConnection = () => {
    throw new Error()
  }
}

class ConnectorErrorTwo extends ZanixConnector {
  protected startConnection = () => true
  protected stopConnection = () => {
    throw new Error()
  }
}

class ConnectorUErrorOne extends ZanixConnector {
  protected startConnection = () => false
  protected stopConnection = () => false
}

class ConnectorUErrorTwo extends ZanixConnector {
  protected startConnection = () => true
  protected stopConnection = () => false
}

Deno.test('ZanixConnector: should wait onConnected and onDisconnected OK', async () => {
  let connected

  await new Promise((resolve) => {
    const onConnected: ConnectionStatusHandler = (status) => {
      connected = status
      resolve(true)
    }

    new Connector('id', {
      onConnected,
    })
  })

  assertEquals(connected, 'OK')

  let disconnected

  await new Promise((resolve) => {
    const onDisconnected: ConnectionStatusHandler = (status) => {
      disconnected = status
      resolve(true)
    }

    const connector = new Connector('id', {
      onDisconnected,
    })

    return connector.connectorReady.then(() => connector['stopConnection']())
  })

  assertEquals(disconnected, 'OK')
})

Deno.test('ZanixConnector: should wait onConnected and onDisconnected Error', async () => {
  let connected: unknown

  await new Promise((resolve) => {
    new ConnectorErrorOne('id', {
      onConnected: (status) => {
        connected = status
        resolve(true)
      },
    })
  })

  assert(connected instanceof Error)
  let disconnected: unknown

  await new Promise((resolve) => {
    const _connector = new ConnectorErrorTwo('id', {
      onConnected: () => {
        _connector['stopConnection']()
      },
      onDisconnected: (status) => {
        disconnected = status
        resolve(true)
      },
    })
  })

  assert(disconnected instanceof Error)
})

Deno.test('ZanixConnector: should wait onConnected unknownError', async () => {
  let connected

  await new Promise((resolve) => {
    new ConnectorUErrorOne('id', {
      onConnected: (status) => {
        connected = status
        resolve(true)
      },
    })
  })

  assertEquals(connected, 'unknownError')

  let disconnected

  await new Promise((resolve) => {
    const onDisconnected: ConnectionStatusHandler = (status) => {
      disconnected = status
      resolve(true)
    }

    const _connector = new ConnectorUErrorTwo('id', {
      onDisconnected,
    })

    return _connector.connectorReady.then(() => _connector['stopConnection']())
  })

  assertEquals(disconnected, 'unknownError')
})
