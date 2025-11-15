/**
 * Recursively decodes all URL-encoded string values within an object or array.
 *
 * This function traverses deeply through the provided value (object or array)
 * and applies `decodeURIComponent()` to every string it encounters.
 * Non-string values are left unchanged.
 *
 * It safely ignores decoding errors and returns the original object structure.
 *
 * @template T - The type of the input object or array. The return type matches the input type.
 * @param {T} obj - The object, array, or value to process and decode.
 * @returns {T} The same object or array with all string values URL-decoded.
 *
 * @example
 * const input = {
 *   user: "John%20Doe",
 *   tags: ["NodeJS%20Dev", "OpenAI%20Contributor"],
 *   profile: { city: "New%20York" }
 * };
 *
 * const result = processUrlParams(input);
 * console.log(result);
 * // {
 * //   user: "John Doe",
 * //   tags: ["NodeJS Dev", "OpenAI Contributor"],
 * //   profile: { city: "New York" }
 * // }
 *
 * @example
 * // Arrays also work:
 * const arr = ["Hello%20World", "Zanix%20Framework"];
 * console.log(processUrlParams(arr));
 * // ["Hello World", "Zanix Framework"]
 */
export const processUrlParams = <T extends unknown>(obj: T): T => {
  try {
    if (typeof obj !== 'object' || obj === null) return obj

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') {
          obj[i] = decodeURIComponent(obj[i])
        } else {
          processUrlParams(obj[i])
        }
      }
    } else {
      for (const key in obj) {
        const value = obj[key as keyof typeof obj]
        if (typeof value === 'string') {
          obj[key as keyof typeof obj] = decodeURIComponent(value) as never
        } else {
          processUrlParams(value)
        }
      }
    }
  } catch {
    //ignore
  }
  return obj
}
