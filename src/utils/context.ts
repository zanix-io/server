export const processScopedPayload = (
  payload: HandlerContext['payload'],
): ScopedContext['payload'] => {
  return {
    params: (key) => payload.params[key],
    search: (key) => payload.search[key],
    body: (key) => payload.body[key],
  }
}
