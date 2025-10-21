import type { TargetBaseClass } from 'modules/infra/base/target.ts'
import type { MetadataInstances, ModuleTypes } from 'typings/program.ts'
import type { BaseContext } from 'typings/context.ts'

import { BaseContainer } from './main.ts'
import { HttpError } from '@zanix/errors'

/**
 * Base container class to control instances
 */
export abstract class BaseInstancesContainer extends BaseContainer {
  #scopedInstances = new Set<string>()

  /**
   * Function to save target instance definition
   */
  public toBeInstanced(baseKey: string, opts: MetadataInstances) {
    const { type, lifetime = 'TRANSIENT', startMode = 'lazy', dataProps, Target } = opts // default definitions

    Target.prototype['_znxProps'] = {
      lifetime,
      startMode,
      type,
      key: baseKey,
      data: dataProps || {},
    }

    // TODO: check if is needed to use Target.length to avlidate constructor parameters

    const key = `${type}:${baseKey}`

    if (opts.lifetime === 'SCOPED' && !this.#scopedInstances.has(key)) {
      this.#scopedInstances.add(key)
    }

    this.setTargetByStartMode(key, startMode)
    this.setTargetByType(baseKey, type)
    this.setTarget(key, Target)
  }

  /**
   * Function to get a target instance
   */
  public getInstance<T extends TargetBaseClass>(
    baseKey: string,
    type: ModuleTypes,
    options?: { ctx?: string | BaseContext },
  ): T
  public getInstance<T extends TargetBaseClass>(
    baseKey: string,
    type: ModuleTypes,
    options?: { ctx?: string | BaseContext; useExistingInstance: true },
  ): T | undefined
  public getInstance<T extends TargetBaseClass>(
    baseKey: string,
    type: ModuleTypes,
    { ctx = 'instance', useExistingInstance }: {
      ctx?: string | BaseContext
      useExistingInstance?: boolean
    } = {},
  ): T | undefined {
    const key = `${type}:${baseKey}`
    const Target = this.getTarget(key)
    try {
      const { lifetime } = Target?.prototype['_znxProps'] || {}
      const instanceKey = `${key}:${
        lifetime === 'SCOPED' ? typeof ctx === 'string' ? ctx : ctx.id : 'instance'
      }`

      const currentInstance = this.getData<T>(instanceKey)
      if (currentInstance || useExistingInstance) return currentInstance

      const instance = Object.freeze(new Target(ctx)) as T

      if (lifetime === 'TRANSIENT') return instance
      else {
        // Remove unnecessary reference
        if (lifetime === 'SINGLETON') this.deleteTarget(key)

        this.setData(instanceKey, instance)

        return instance
      }
    } catch (e) {
      throw new HttpError('INTERNAL_SERVER_ERROR', {
        message: `An error ocurred on trying to instance a class type '${type}'. ${
          Target ? `Target:${Target.name}` : 'There is not metadata information'
        }`,
        cause: e,
      })
    }
  }

  /**
   * Reset all lazy scoped instances
   */
  public resetScopedInstances(ctxId: string) {
    if (this.#scopedInstances.size === 0) return
    const scopedInstances = Array.from(this.#scopedInstances).map((k) => `${k}:${ctxId}`)

    scopedInstances.forEach((key) => {
      this.deleteData(key)
    })
  }
}
