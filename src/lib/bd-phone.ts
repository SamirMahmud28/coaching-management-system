/** A Bangladeshi mobile number in its stored form: 11 digits starting 01 (operators 3–9). */
export const BD_MOBILE_RE = /^01[3-9]\d{8}$/;

/** "+880 1712-345678", "8801712345678" and "01712345678" all become "01712345678"; anything else is null. */
export function normalizeBdMobile(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "").replace(/^\+?880/, "0");
  return BD_MOBILE_RE.test(digits) ? digits : null;
}
