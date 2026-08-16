// deno-coverage-ignore-file
import Program from 'modules/program/mod.ts'
import './metadata.ts'
import { targetInitializations } from 'utils/targets.ts'
import { webServerManager } from 'webserver/mod.ts'
import logger from '@zanix/logger'

const id1 = webServerManager.create('rest', {
  server: { globalPrefix: '/api//', cors: { origins: ['*'] } },
})
const id2 = webServerManager.create('socket', {
  server: { port: 9222, globalPrefix: 'sock', cors: { origins: ['*'] } },
})
const id3 = webServerManager.create('graphql', {
  server: { port: 9333, globalPrefix: '/gql//' },
})

for await (const mode of ['onSetup', 'onBoot'] as const) {
  await targetInitializations(mode)
}

webServerManager.start([id1, id2, id3])

logger.debug(JSON.stringify(Object.keys(Program.targets), null, 2))
Deno.exit(0)
