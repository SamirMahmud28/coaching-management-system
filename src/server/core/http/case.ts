/**
 * Converts response keys to the API's snake_case wire format. Keys already written as constants (`ON_HOLD`, `BKASH`)
 * are values such as enum names used as map keys, so they're kept as they are.
 */
export function toSnakeCaseKeys<T>(value: T): unknown {
  if (Array.isArray(value)) return value.map((v) => toSnakeCaseKeys(v));
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const wire = /^[A-Z][A-Z0-9_]*$/.test(key) ? key : key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      out[wire] = toSnakeCaseKeys(val);
    }
    return out;
  }
  return value;
}
