import type { TargetBaseClass } from 'modules/infra/base/target.ts'
import type { ClassConstructor } from 'typings/targets.ts'
import type { MetadataInstances, ModuleTypes } from 'typings/program.ts'
import type { InstanceOptions } from 'typings/context.ts'
import type { ZanixConnector } from 'connectors/base.ts'

import { DEFAULT_CONTEXT_ID, INSTANCE_KEY_SEPARATOR, ZANIX_PROPS } from 'utils/constants.ts'
import { TargetError } from 'utils/errors/target.ts'
import { logAppError } from 'utils/errors/helper.ts'
import { BaseContainer } from '../base.ts'

/**
 * Base container class to control instances
 */
export abstract class BaseInstancesContainer extends BaseContainer {
  #scopedInstances = new Set<string>()
  #getKey = (type: ModuleTypes, baseKey: string) => `${type}${INSTANCE_KEY_SEPARATOR}${baseKey}`
  #getInstanceKey = (key: string, keyId: string) => `${key}${INSTANCE_KEY_SEPARATOR}${keyId}`

  // (caller class -> already-warned target classes), so a SINGLETON resolving the same SCOPED
  // target on every request warns once per process, not once per resolution call.
  #singletonResolvesScopedWarned = new WeakMap<object, WeakSet<object>>()

  /**
   * Warns when a `SINGLETON`-lifetime `caller` resolves a `SCOPED`-lifetime `Target`.
   *
   * A `SINGLETON` is constructed once with a fixed, non-request context. Any `SCOPED` target it
   * resolves gets cached under that same fixed context forever (see `getInstance` below), and
   * never receives its `close()`/`onDestroy()` call — those only fire for instances tied to a
   * real per-request context (see `resetScopedInstances`). In effect, the `SCOPED` target quietly
   * becomes a leaked de-facto singleton, regardless of its own declared lifetime. This only warns
   * (via `logAppError`) rather than throwing, since some apps may already — intentionally or not —
   * rely on this behavior.
   */
  #warnIfSingletonResolvesScoped(caller: TargetBaseClass, Target: ClassConstructor): void {
    const callerProps = (caller as unknown as Record<string, unknown>)[ZANIX_PROPS] as
      | { lifetime?: string }
      | undefined

    if (callerProps?.lifetime !== 'SINGLETON') return

    const callerCtor = caller.constructor
    let warnedTargets = this.#singletonResolvesScopedWarned.get(callerCtor)
    if (!warnedTargets) {
      warnedTargets = new WeakSet()
      this.#singletonResolvesScopedWarned.set(callerCtor, warnedTargets)
    }
    if (warnedTargets.has(Target)) return
    warnedTargets.add(Target)

    logAppError(new Error('A SINGLETON instance resolved a SCOPED target'), {
      message: `'${callerCtor.name}' is SINGLETON but resolved '${Target.name}', which is ` +
        `SCOPED. Since a SINGLETON is cached under a fixed, non-request context, the resolved ` +
        `SCOPED target is cached under that same context forever and never receives ` +
        `close()/onDestroy() — it silently becomes a leaked de-facto singleton. Consider making ` +
        `'${callerCtor.name}' SCOPED too, or '${Target.name}' SINGLETON.`,
      code: 'SINGLETON_RESOLVES_SCOPED',
      meta: {
        source: 'zanix',
        caller: callerCtor.name,
        callerLifetime: 'SINGLETON',
        target: Target.name,
        targetLifetime: 'SCOPED',
      },
      contextId: (caller as unknown as { contextId?: string }).contextId,
    }).catch(() => {})
  }

  /**
   * Function to save target instance definition
   */
  protected toBeInstantiated(baseKey: string, opts: MetadataInstances): { key: string } {
    const { type, lifetime, startMode, dataProps, Target } = opts // default definitions

    // Defined as non-enumerable so it never leaks through JSON.stringify/spread/Object.keys
    // on instances (or their prototypes) beyond this internal DI metadata's intended use.
    Object.defineProperty(Target.prototype, ZANIX_PROPS, {
      value: {
        lifetime,
        startMode,
        type,
        key: baseKey,
        data: dataProps || {},
      },
      enumerable: false,
      writable: true,
      configurable: true,
    })

    const key = this.#getKey(type, baseKey)

    // All scoped instances registered here will be removed at the end of the request cleanup.
    if (lifetime === 'SCOPED' && !this.#scopedInstances.has(key)) {
      this.#scopedInstances.add(key)
    }

    return { key }
  }

  /**
   * Function to get a target instance
   */
  protected getInstance<T extends TargetBaseClass>(
    baseKey: string,
    type: ModuleTypes,
    options: InstanceOptions = {},
  ): T {
    const { useExistingInstance, keyId, params, verbose = true, caller } = options

    const key = this.#getKey(type, baseKey)
    const Target = this.getTarget(key)

    const znxProps = Target?.prototype?.[ZANIX_PROPS] ?? {}
    const { lifetime, startMode } = znxProps

    try {
      const isTransient = lifetime === 'TRANSIENT'
      const isSingleton = lifetime === 'SINGLETON'
      const isScoped = lifetime === 'SCOPED'
      const isSetupMode = startMode !== 'lazy'

      if (caller && isScoped && Target) this.#warnIfSingletonResolvesScoped(caller, Target)

      const instanceKey = this.#getInstanceKey(key, isScoped && keyId || DEFAULT_CONTEXT_ID)

      const currentInstance = this.getData<T>(instanceKey)
      if (currentInstance || useExistingInstance) return currentInstance

      if (isTransient && isSetupMode || isSingleton) this.deleteTarget(key)

      const context = isSingleton ? DEFAULT_CONTEXT_ID : (params || DEFAULT_CONTEXT_ID)

      if (typeof Target !== 'function') {
        throw new TypeError(
          '[BaseInstancesContainer]: Target is not a constructor. Ensure the corresponding class is decorated with the appropriate DI registration decorator.',
        )
      }

      const instance = new Target(context) as T

      this.instanceFreeze(instance)

      if (!isTransient) this.setData(instanceKey, instance)

      return instance
    } catch (e) {
      throw new TargetError('This action cannot be completed at the moment.', startMode, {
        code: 'INVALID_INSTANCE',
        meta: {
          key,
          source: 'zanix',
          classType: type,
          message: 'An error ocurred on trying to instance the class',
          targetName: Target ? `${Target.name}` : "'unknown': there is no metadata information",
        },
        shouldLog: verbose,
        cause: e,
      })
    }
  }

  /**
   * Freeze instance object
   */
  private instanceFreeze<T extends TargetBaseClass>(instance: T) {
    if ('isReady' in instance) {
      ;(instance as unknown as typeof ZanixConnector['prototype']).isReady.then(() => {
        Object.freeze(instance)
      })
    } else Object.freeze(instance)
  }

  /**
   * Reset all scoped instances
   */
  public async resetScopedInstances(keyId: string) {
    if (this.#scopedInstances.size === 0) return
    const scopedInstances = Array.from(this.#scopedInstances).map((key) =>
      this.#getInstanceKey(key, keyId)
    )

    const promises = []

    for (const key of scopedInstances) {
      // Close connection if is a connector instance
      if (key.startsWith('connector')) {
        const instance = this.getData<ZanixConnector | undefined>(key)
        if (instance) {
          promises.push(instance['close']())
          instance['onDestroy']()
        }
      } else this.getData<TargetBaseClass>(key)?.['onDestroy']()

      this.deleteData(key)
    }

    await Promise.all(promises)
  }
}
