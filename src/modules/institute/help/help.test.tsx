// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PERMISSION_CATALOG } from "@/server/core/rbac/catalog";
import { HELP_TOPICS } from "./content";
import { HelpGuide } from "./help-guide";
import { HowThisWorks } from "./how-this-works";

afterEach(cleanup);

describe("help content", () => {
  it("has a summary and steps for every guide, unique keys, and only real permissions", () => {
    const names = new Set<string>(PERMISSION_CATALOG.map((p) => p.name));
    expect(new Set(HELP_TOPICS.map((t) => t.key)).size).toBe(HELP_TOPICS.length);
    for (const t of HELP_TOPICS) {
      expect(t.summary.length, t.key).toBeGreaterThan(20);
      expect(t.steps.length, t.key).toBeGreaterThan(0);
      if (t.permission) expect(names.has(t.permission), t.key).toBe(true);
    }
  });

  it("is on every admin feature page (a feature isn't done without its help)", async () => {
    const root = path.join(process.cwd(), "src/app/institute/app/(admin)");
    const pages: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.isDirectory()) await walk(path.join(dir, e.name));
        else if (e.name === "page.tsx") pages.push(path.join(dir, e.name));
      }
    };
    await walk(root);
    // The Help centre itself, and the placeholder for paid modules not built yet.
    const exempt = ["help", "[module]"].map((d) => path.join(root, d, "page.tsx"));
    const missing: string[] = [];
    for (const page of pages.filter((p) => !exempt.includes(p))) {
      const source = await readFile(page, "utf8");
      if (source.includes("<HowThisWorks")) continue;
      const imported = [...source.matchAll(/from "@\/modules\/institute\/components\/([^"]+)"/g)].map((m) => path.join(process.cwd(), "src/modules/institute/components", `${m[1]}.tsx`));
      const covered = await Promise.all(imported.map(async (f) => (await readFile(f, "utf8").catch(() => "")).includes("<HowThisWorks")));
      if (!covered.some(Boolean)) missing.push(path.relative(process.cwd(), page).replaceAll("\\", "/"));
    }
    expect(missing).toEqual([]);
  });
});

describe("How this works panel and guides", () => {
  it("start collapsed and expand when clicked", async () => {
    render(<HowThisWorks topic="fees-student" />);
    expect(screen.queryByText(/Each charge is paid in full/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /How this works/ }));
    expect(screen.getByText(/Each charge is paid in full/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read the full guide/ })).toHaveAttribute("href", "/app/help#fees-student");
    await userEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText(/Each charge is paid in full/)).not.toBeInTheDocument();
  });

  it("show a guide's title and summary, open it on click, and open the one a link points to", async () => {
    const topic = HELP_TOPICS.find((t) => t.key === "fees-reports")!;
    render(<HelpGuide topic={topic} />);
    expect(screen.getByText(topic.summary)).toBeInTheDocument();
    expect(screen.queryByText("Common questions")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Fee reports/ }));
    expect(screen.getByText("Common questions")).toBeInTheDocument();
    cleanup();
    window.location.hash = "#fees-reports";
    render(<HelpGuide topic={topic} />);
    expect(screen.getByText("Common questions")).toBeInTheDocument();
    window.location.hash = "";
  });
});
