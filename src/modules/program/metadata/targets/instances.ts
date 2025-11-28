import type { TargetBaseClass } from 'modules/infra/base/target.ts'
import type { MetadataInstances, ModuleTypes } from 'typings/program.ts'
import type { InstanceOptions } from 'typings/context.ts'
import type { ZanixConnector } from 'connectors/base.ts'

import { DEFAULT_CONTEXT_ID, INSTANCE_KEY_SEPARATOR, ZANIX_PROPS } from 'utils/constants.ts'
import { TargetError } from 'utils/errors.ts'
import { BaseContainer } from '../base.ts'

/**
 * Base container class to control instances
 */
export abstract class BaseInstancesContainer extends BaseContainer {
  #scopedInstances = new Set<string>()
  #getKey = (type: ModuleTypes, baseKey: string) => `${type}${INSTANCE_KEY_SEPARATOR}${baseKey}`
  #getInstanceKey = (key: string, keyId: string) => `${key}${INSTANCE_KEY_SEPARATOR}${keyId}`

  /**
   * Function to save target instance definition
   */
  protected toBeInstantiated(baseKey: string, opts: MetadataInstances): { key: string } {
    const { type, lifetime, startMode, dataProps, Target } = opts // default definitions

    Target.prototype[ZANIX_PROPS] = {
      lifetime,
      startMode,
      type,
      key: baseKey,
      data: dataProps || {},
    }

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
    const { useExistingInstance, keyId, params, verbose = true } = options

    const key = this.#getKey(type, baseKey)
    const Target = this.getTarget(key)

    const znxProps = Target?.prototype?.[ZANIX_PROPS] ?? {}
    const { lifetime, startMode } = znxProps

    try {
      const isTransient = lifetime === 'TRANSIENT'
      const isSingleton = lifetime === 'SINGLETON'
      const isScoped = lifetime === 'SCOPED'
      const isSetupMode = startMode !== 'lazy'

      const instanceKey = this.#getInstanceKey(key, isScoped && keyId || DEFAULT_CONTEXT_ID)

      const currentInstance = this.getData<T>(instanceKey)
      if (currentInstance || useExistingInstance) return currentInstance

      if (isTransient && isSetupMode || isSingleton) {
        this.deleteTarget(key)
      }

      const context = isSingleton ? DEFAULT_CONTEXT_ID : (params || DEFAULT_CONTEXT_ID)

      const instance = new Target(context) as T

      this.instanceFreeze(instance)

      if (!isTransient) {
        this.setData(instanceKey, instance)
      }

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

    this.#scopedInstances.clear()
  }
}
