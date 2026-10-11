/** Converts response keys to the API's snake_case wire format. */
export function toSnakeCaseKeys<T>(value: T): unknown {
  if (Array.isArray(value)) return value.map((v) => toSnakeCaseKeys(v));
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = toSnakeCaseKeys(val);
    }
    return out;
  }
  return value;
}
