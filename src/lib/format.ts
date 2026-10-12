const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const formatDate = (iso: string | null | undefined) => (iso ? date.format(new Date(iso)) : "—");
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : "—");

/** "MODULE_ENTITLEMENT_CHANGED" → "Module entitlement changed"; "TENANT_SUSPENDED" → "Institute suspended". */
export const humanizeAction = (action: string) => {
  const s = action.replace(/^TENANT_/, "INSTITUTE_").toLowerCase().replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** An in-use reference for people: ("SUBJECT", 2) → "2 subjects"; ("BATCH", 1) → "1 batch". A type already plural ("students") is kept. */
export const describeReference = (type: string, count: number) => {
  const noun = type.toLowerCase().replaceAll("_", " ");
  return `${count} ${count === 1 || noun.endsWith("s") ? noun : /(x|ch|sh)$/.test(noun) ? `${noun}es` : `${noun}s`}`;
};
