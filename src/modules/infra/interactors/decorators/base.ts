import type { InteractorDecoratorOptions, ZanixClassDecorator } from 'typings/decorators.ts'
import type { Lifetime } from 'typings/program.ts'

import { defineInteractorDecorator } from './assembly.ts'

/**
 * Class decorator that registers a class as an `interactor` — the layer implementing business
 * logic, typically consumed by handlers.
 *
 * By default, the interactor uses the `SCOPED` lifetime strategy unless otherwise specified.
 *
 * ℹ️ The **interactor** with a `TRANSIENT` lifetime should be used **only** during configuration or setup.
 * It is **not supported** when using StarMode with lazy initialization, as it has no practical effect.
 *
 * ⚠️ Be cautious when using a **transient interactor** as a dependency of any handler,
 * since its reference will be discarded immediately after use.
 *
 * @param {InteractorDecoratorOptions} [options] - Configuration object that defines:
 *   - `lifetime`: (Optional) The lifetime strategy for the interactor (`SCOPED`, `SINGLETON`, `TRANSIENT`).
 *   - `startMode`: (Optional) The initialization mode for the interactor (`onSetup`, `onBoot`, `postBoot`,
 *     or `lazy` — `lazy` is not allowed when `lifetime` is `TRANSIENT`).
 *
 * @returns {ZanixClassDecorator} The class decorator function.
 *
 * @example
 * ```ts
 * \@Interactor()
 * class UsersInteractor extends ZanixInteractor {
 *   public findById(id: string) {
 *     return this.providers.get(UsersRepository).findById(id)
 *   }
 * }
 * ```
 */
export function Interactor<L extends Lifetime>(
  options?: InteractorDecoratorOptions<L>,
): ZanixClassDecorator {
  return defineInteractorDecorator(options)
}
