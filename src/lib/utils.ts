export { cn } from "cn"

/** The href of the tab for this path: an exact match, else the longest tab path the current one sits under. */
export function activeTab(pathname: string, tabs: { href: string }[]): string | undefined {
  return tabs
    .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
