import { ZanixCacheConnector } from './cache.ts'
import connectorCoreModules, { registerCoreConnectorSlot } from './all.ts'

// `'cache:custom'`/`'cache:memcached'` still self-register here because no package currently
// ships a concrete implementation for either — there's no owner to hand the registration call to
// yet. `'kvLocal'`/`'database'`/`'search'`/`'asyncmq'`/`'cache:local'`/`'cache:redis'` all moved to
// their owning packages' own `/core` entrypoints (`@zanix/datamaster`, `@zanix/asyncmq`).
registerCoreConnectorSlot('cache:custom', ZanixCacheConnector)
registerCoreConnectorSlot('cache:memcached', ZanixCacheConnector)

export default connectorCoreModules
