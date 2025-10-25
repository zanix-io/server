// WeakMap to associate each class constructor with its unique ID.
// WeakMap ensures that once the class is no longer referenced, its entry is GC'ed.
const classIds = new WeakMap<{ name: string }, string>()
let counter = 1

export const getTargetKey = (target?: { name: string }) => {
  // If no target provided, return empty string
  if (!target) return ''

  const { name } = target

  // Prevent the use of reserved class name prefixes.
  if (name.startsWith('_Zanix')) {
    throw new Deno.errors.Interrupted(
      "Class names starting with '_Zanix' are reserved and cannot be used. Please choose a different class name.",
    )
  }

  // Check if this class already has an assigned key.
  const existing = classIds.get(target)
  if (existing) return existing

  // Otherwise, create a new unique key for this specific class reference.
  // Even if another class has the same `name`, it will receive a different key.
  const newId = `Z$${name}$${counter++}`
  classIds.set(target, newId)

  return newId
}
