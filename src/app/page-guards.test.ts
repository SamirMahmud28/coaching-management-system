import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard checks (CLAUDE.md non-negotiable 2): every institute app page calls the single page guard, and every
 * Super Admin page sits under the guarded layout and reads data only through the guarded platform API.
 */

async function pages(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await pages(full)));
    else if (e.name === "page.tsx") out.push(full);
  }
  return out;
}
const rel = (file: string) => path.relative(process.cwd(), file).replaceAll("\\", "/");

describe("page guards", () => {
  it("every institute app page calls requireModulePage, requirePortal or requirePrintPage", async () => {
    const files = await pages(path.join(process.cwd(), "src/app/institute/app"));
    expect(files.length).toBeGreaterThan(10);
    const unguarded = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (!/\b(requireModulePage|requirePortal|requirePrintPage)\(/.test(source)) unguarded.push(rel(file));
    }
    expect(unguarded).toEqual([]);
  });

  it("institute pages outside /app are only the public pages and the sign-in pages", async () => {
    const files = (await pages(path.join(process.cwd(), "src/app/institute"))).map(rel).filter((f) => !f.startsWith("src/app/institute/app/"));
    expect(files.sort()).toEqual([
      "src/app/institute/(auth)/change-password/page.tsx",
      "src/app/institute/(auth)/login/page.tsx",
      "src/app/institute/[page]/page.tsx",
      "src/app/institute/page.tsx",
    ]);
    // The website's other pages (D142) show only what the public page may: the institute must be visible (D58), and the
    // data comes only from the public website, which is empty while the Website module is off (D21).
    const websitePage = await readFile(path.join(process.cwd(), "src/app/institute/[page]/page.tsx"), "utf8");
    expect(websitePage).toMatch(/\bpublicPageVisible\(/);
    expect(websitePage).toMatch(/\bloadPublicWebsite\(/);
    expect(websitePage).not.toMatch(/from "@\/server\/core\/db/);
  });

  it("every Super Admin page is under the guarded layout and loads data only through the platform API", async () => {
    const layout = await readFile(path.join(process.cwd(), "src/app/platform/(app)/layout.tsx"), "utf8");
    expect(layout).toMatch(/\brequireCurrentPlatformAdmin\(/);
    const files = (await pages(path.join(process.cwd(), "src/app/platform"))).map(rel);
    const outsideLayout = files.filter((f) => !f.startsWith("src/app/platform/(app)/")).sort();
    // The sign-in pages, and the root page that only redirects into the guarded app.
    expect(outsideLayout).toEqual(["src/app/platform/(auth)/change-password/page.tsx", "src/app/platform/(auth)/login/page.tsx", "src/app/platform/page.tsx"]);
    for (const file of files.filter((f) => f.startsWith("src/app/platform/(app)/"))) {
      const source = await readFile(path.join(process.cwd(), file), "utf8");
      expect(source, `${file} reads no data on the server`).not.toMatch(/from "@\/server\/(core\/db|modules\/)/);
    }
  });
});
