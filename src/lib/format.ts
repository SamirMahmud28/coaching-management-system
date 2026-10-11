const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const formatDate = (iso: string | null | undefined) => (iso ? date.format(new Date(iso)) : "—");
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : "—");

/** "MODULE_ENTITLEMENT_CHANGED" → "Module entitlement changed"; "TENANT_SUSPENDED" → "Institute suspended". */
export const humanizeAction = (action: string) => {
  const s = action.replace(/^TENANT_/, "INSTITUTE_").toLowerCase().replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
