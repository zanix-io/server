import type { CoreConnectorTemplates } from 'typings/targets.ts'

import { ZanixProvider } from '../base.ts'

/**
 * Abstract base class for providers that integrate with notification-sending systems (email,
 * SMS, push, etc.).
 *
 * This class extends {@link ZanixProvider} and is the foundation `@zanix/notifications`'s
 * `NotifierProvider` builds on, so the framework recognizes it as the `'notifications'` core
 * provider (see `ProviderCoreModules`) — this is what makes `this.providers.get('notifications')`
 * and the `@Provider({ type: 'notifications' })` registration path work.
 *
 * Extend this class (indirectly, via `@zanix/notifications`'s `NotifierProvider`) to implement
 * custom notification provider variants.
 *
 * @abstract
 * @extends ZanixProvider
 */
export abstract class ZanixCoreNotificationsProvider<T extends CoreConnectorTemplates = object>
  extends ZanixProvider<T> {}
