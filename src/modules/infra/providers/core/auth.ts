import type { CoreConnectorTemplates } from 'typings/targets.ts'

import { ZanixProvider } from '../base.ts'

/**
 * Abstract base class for providers that integrate with authentication/authorization systems.
 *
 * This class extends {@link ZanixProvider} and is the foundation `@zanix/auth`'s `ZanixAuthProvider`
 * builds on, so the framework recognizes it as the `'auth'` core provider (see
 * `ProviderCoreModules`) — this is what makes `this.providers.get('auth')` and the
 * `@Provider({ type: 'auth' })` registration path work.
 *
 * Extend this class (indirectly, via `@zanix/auth`'s `ZanixAuthProvider`) to implement custom
 * authentication provider variants.
 *
 * @abstract
 * @extends ZanixProvider
 */
export abstract class ZanixCoreAuthProvider<T extends CoreConnectorTemplates = object>
  extends ZanixProvider<T> {}
