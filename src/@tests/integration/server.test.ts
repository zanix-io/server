// deno-lint-ignore-file no-explicit-any
import { WebServerManager } from 'modules/webserver/manager.ts'
import { assert, assertEquals, assertThrows } from '@std/assert'
import { stub } from '@std/testing/mock'
import { getTemporaryFolder } from '@zanix/helpers'

stub(console, 'info')
stub(console, 'error')

Deno.env.delete('SSL_KEY_PATH')
Deno.env.delete('SSL_CERT_PATH')

Deno.test('Web server manager should start one server', async () => {
  const webServerManager = new WebServerManager()

  const id = webServerManager.create('rest', {
    handler: () => {
      return new Response('response')
    },
  })

  webServerManager.start()

  const server = webServerManager.info(id)
  assertEquals(server.addr?.port, 8000)
  assertEquals(server.protocol, 'http')
  assertEquals(server.type, 'rest')
  await webServerManager.stop(id)

  webServerManager.delete(id)

  assert(webServerManager.info(id).addr === undefined)
  assert(webServerManager.info(id).protocol === undefined)
})

Deno.test('Web server manager should return env ports', () => {
  Deno.env.set('PORT', '20201')
  assertEquals(new WebServerManager()['getEnvPort']('rest'), 20201)
  Deno.env.delete('PORT')

  Deno.env.set('PORT', '20202')
  assertEquals(new WebServerManager()['getEnvPort']('rest'), 20202)
  Deno.env.delete('PORT')

  Deno.env.set('PORT', '30248')
  assertEquals(new WebServerManager()['getEnvPort']('rest'), 30248)
  Deno.env.delete('PORT')

  Deno.env.set('PORT_GRAPHQL', '30248')
  assertEquals(new WebServerManager()['getEnvPort']('graphql'), 30248)
  Deno.env.delete('PORT_GRAPHQL')

  Deno.env.set('PORT_SOCKET', '20202')
  assertEquals(new WebServerManager()['getEnvPort']('socket'), 20202)
  Deno.env.delete('PORT_SOCKET')
})

Deno.test('Web server manager should start multiple servers', async () => {
  Deno.env.set('PORT', '9183')
  const webServerManager = new WebServerManager()

  const id = webServerManager.create('rest', {
    handler: () => new Response('response'),
  })
  const id2 = webServerManager.create('rest', {
    handler: () => new Response('response'),
  })

  Deno.env.delete('PORT')

  webServerManager.start(id)
  webServerManager.start(id) // ignore start

  const err = assertThrows(
    () => webServerManager.start(id2),
    Deno.errors.Interrupted,
    `Port 9183 is already in use and cannot be assigned to the REST server with ID ${id2}. Please choose a different port.`,
  ) // cannot start with the same port
  assertEquals(
    (err.cause as any)?.message,
    `Address already in use (os error 48) by REST server with ID ${id}.`,
  )

  assertEquals(webServerManager.info(id).addr?.port, 9183)
  assertEquals(webServerManager.info(id).protocol, 'http')

  const rest = webServerManager.create('rest', {
    handler: () => new Response('response'),
  })

  webServerManager.start(rest)
  assertEquals(webServerManager.info(rest).addr?.port, 8000)
  assertEquals(webServerManager.info(rest).protocol, 'http')
  webServerManager.stop(rest)

  const randomId = 'random-server-undefined-1-1'
  webServerManager.start(randomId)
  assert(webServerManager.info(randomId).addr === undefined)

  await webServerManager.stop(id)
  await webServerManager.stop(id) // ignore stop

  webServerManager.delete(id)
  assert(webServerManager.info(id).addr === undefined)
  assert(webServerManager.info(id).protocol === undefined)
})

Deno.test('Web server should start https', async () => {
  const tmp = getTemporaryFolder(import.meta.url) + '/ssl'

  await Deno.mkdir(tmp, { recursive: true })

  await Deno.writeTextFile(
    tmp + '/dummy.cert',
    `-----BEGIN CERTIFICATE-----
MIIDRTCCAi2gAwIBAgIURZhCT5206Inf8j3EdfDVIFspKWMwDQYJKoZIhvcNAQEL
BQAwMjELMAkGA1UEBhMCWlgxEzARBgNVBAgMClNvbWUtU3RhdGUxDjAMBgNVBAoM
BVphbml4MB4XDTI0MDkyODAxNDMxM1oXDTI1MDkyODAxNDMxM1owMjELMAkGA1UE
BhMCWlgxEzARBgNVBAgMClNvbWUtU3RhdGUxDjAMBgNVBAoMBVphbml4MIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtL1a08ZWh2FL/GJujJ0eEHx6HbKU
sIrTEfBd+84t/hSIxCUu3EKbTabI/ZeRWZkYChEQcrqBHfa/xunRe3beMaubFckv
ZGwe6f5s379W/bYroW5o7oboI5rhv1Hgx1VlJjpgkcBvEurAf+7LeKKOPVT2ApQb
KiInSlGlVGb8+lRM0uwUjCcCW8SzQe4KWlfbfDbXJWzHyIQQ7BS6g5tLUsOE9ujL
bfaF+Wr0IrUuZOrQJJJbqqzFTppxRNBCYoLtxpPhCaqQPMfxxc/AG0SJIM/yYYeM
sqgC8ubXYpgKLA+IBC+17jHY//8B5LOr58BsmGB+b7U+rmHFm6bEjpHtyQIDAQAB
o1MwUTAdBgNVHQ4EFgQUwJX5TxhRcjbHk+XHo4+ZjKiH+rkwHwYDVR0jBBgwFoAU
wJX5TxhRcjbHk+XHo4+ZjKiH+rkwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0B
AQsFAAOCAQEAotKYCVZE93G1fHjvs7mkYq8WTsHv9MmEMVJupj21R38TuTTBR0rO
e5s2kcygzFPRCOdoPHNxFJPhbc7nvLOOz6b9dwV1yVcUP53hXInweZyhub9DsM9j
Qxr2XYM8738lcgrZ5Q7dWwychRNvBfq6HRKH0Nw5/15oyoEKVQea7TwYXeh9/nT0
/ZC1xzETnUGyxeliLiWo1fU4YtTCEo8g5o7Jpwqc8eo9CioP2JKWbiXsvpyFwbi8
j+rPgU5nUD6Qn7yXbzE2IckBoGS6zxnUjId4JVLGyNA+p7xi1Jzmq5uC+ukJ3ON8
YZPeJnup7290SmxKbN3+PanCT7TJCw3kGQ==
-----END CERTIFICATE-----
`,
  )
  await Deno.writeTextFile(
    tmp + '/dummy.key',
    `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC0vVrTxlaHYUv8
Ym6MnR4QfHodspSwitMR8F37zi3+FIjEJS7cQptNpsj9l5FZmRgKERByuoEd9r/G
6dF7dt4xq5sVyS9kbB7p/mzfv1b9tiuhbmjuhugjmuG/UeDHVWUmOmCRwG8S6sB/
7st4oo49VPYClBsqIidKUaVUZvz6VEzS7BSMJwJbxLNB7gpaV9t8NtclbMfIhBDs
FLqDm0tSw4T26Mtt9oX5avQitS5k6tAkkluqrMVOmnFE0EJigu3Gk+EJqpA8x/HF
z8AbRIkgz/Jhh4yyqALy5tdimAosD4gEL7XuMdj//wHks6vnwGyYYH5vtT6uYcWb
psSOke3JAgMBAAECggEAC9Pfa3/tfi8FErdbTirjAoeu0x4yYko3bVNaRyXzNw8f
cxyO0D2wnZiGSygdzCv7WX9L4QIo/G2/F5SKD6cT+9Kj071mc08rB7uNYugJ2JER
El+gEMn1y4yxbLx+NfU16RZFZwxdiHKh1c1p9dNHdSaH8dvA2lVBVnj41Yjm0bfR
hG4sFwDnA55OJva8Nq11oBTSS7a+ir8E7QJ1YmZeNsWxE6FYlG/KOTRjSIl7H15a
CNHZ3BPuCXLcjny1hV0D5QJEdwpit/ekIvusqpn5wJElfrMrbQJsiR3iE9mz9O+Y
j1M379yW+7WB3pQH0X21R4v3dgPkjmFEz6OFam71wQKBgQD9vXkb6GQStYHb8fQg
74wm/msD3xyom4T1FSDMCLw58B90vJ1uHqJ8LpLylM+uG/UKM7lzb3UWnpHC5JgJ
77nAQgWeqxGKrKlHNxcxPrgxWD/2ppc++/qliQ39fcbKOVslFE6P7anpuZavAu9X
v/U061naGEuawL2iQn5Orc6BIQKBgQC2WXDZ28ReHxYpPLuJ+fRSV4mTV+tgu2aa
TvBTmuU9OFNXG0ZLCt7TR6Ld6IWF9vIykXuVm7SrKH8bnpiIEmmY10NNxF1vQTdy
XaqJYiDZGgCDHmOasH5EFkyj46qgU25LZMSOQzvxOhyZ2XX9it1Nek2/mz7OyPyD
oq12uzXPqQKBgQDZ+CvTZ3yf/cACGwTmTiGNVbzEZKMPzBkZF/9GhrJ66uV6uJRc
hoB6QOAG9wK4xFdpXimPGk3xEmKQkyJwVriwiYaeWMIG6G+6N3761LAR44d+8Hi4
qGkWTnfwLF3aVg8P+TPLvBPcLYtd6B2GueWAgjR7f6di1vOQMaKjH/dnQQKBgQCV
l6Jg102s+Uuw4MXpV0j8FBwk6EeMv7BYftHhhHzzUDXui82K2owaP/Z4nbyMPh5L
JdaA0Y/RqhM8kUsItjIy1MW+Eo2kK5hVFkpFEl9oO1CYQGHuEUREjxaojKj5hfhB
mZU2MCoIp2e3PxLwwO70FJWbzrwj3/Zn9xjfAo4OoQKBgCuWDVt7MwYou6voVO1j
JnqZaaxULBQW0DlDHSHp2yfAPOEvubaE47A/j39xwp+v97Eas5mefyG+9TtFOt1t
2y7ivAl/qidQJtFMVTFdcZvWkiZv3QNpmeHKulsEOwQi/yMrq0AOrxF6kgZSS0YY
jyYkHXyzeg8h3FWE8e+iDp0L
-----END PRIVATE KEY-----
`,
  )

  Deno.env.set('SSL_KEY_PATH', tmp + '/dummy.key')
  Deno.env.set('SSL_CERT_PATH', tmp + '/dummy.cert')

  const webServerManager = new WebServerManager()

  const id = webServerManager.create('rest', {
    handler: () => new Response('response'),
  })

  webServerManager.start(id)

  assertEquals(webServerManager.info(id).protocol, 'https')

  await webServerManager.stop(id)

  Deno.env.delete('SSL_KEY_PATH')
  Deno.env.delete('SSL_CERT_PATH')
  await Deno.remove(tmp, { recursive: true })
})
