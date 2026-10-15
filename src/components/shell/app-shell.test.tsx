// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookOpen, LayoutDashboard, UserRound, Wallet } from "lucide-react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { activeHref, AppShell, type NavItem } from "./app-shell";

const push = vi.fn();
let pathname = "/app";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));

beforeAll(() => {
  // cmdk measures its list and scrolls the selected item into view; jsdom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  push.mockReset();
  pathname = "/app";
});

const NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/students", label: "Students", icon: UserRound, group: "Daily work" },
  { href: "/app/fees", label: "Fees", icon: Wallet, group: "Daily work", badge: 3 },
  { href: "/app/courses", label: "Courses & batches", icon: BookOpen, group: "Setup" },
];

function renderShell(extra: Partial<React.ComponentProps<typeof AppShell>> = {}) {
  return render(
    <TooltipProvider>
      <AppShell nav={NAV} appLabel="Alo Coaching" user={{ name: "Farhana Akter", email: "owner@alo.test" }} onSignOut={vi.fn()} brand={{ name: "Alo Coaching" }} {...extra}>
        <p>Page body</p>
      </AppShell>
    </TooltipProvider>,
  );
}

describe("AppShell", () => {
  it("groups the menu, marks the current page and shows attention counts", () => {
    pathname = "/app/fees/collect";
    renderShell();
    const menu = screen.getAllByRole("navigation")[0]!;
    expect(within(menu).getByText("Daily work")).toBeInTheDocument();
    expect(within(menu).getByText("Setup")).toBeInTheDocument();
    const fees = within(menu).getByRole("link", { name: /Fees/ });
    expect(fees).toHaveAttribute("aria-current", "page");
    expect(fees).toHaveTextContent("3");
    expect(within(menu).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("shows breadcrumbs for the section and the page under it", () => {
    pathname = "/app/fees/collect";
    renderShell();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Fees" })).toHaveAttribute("href", "/app/fees");
    expect(within(crumbs).getByText("Collect")).toHaveAttribute("aria-current", "page");
  });

  it("names an id segment Details", () => {
    pathname = "/app/students/7b0c2a3e-1111-4222-8333-944455556666";
    renderShell();
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Details")).toBeInTheDocument();
  });

  it("has a phone tab bar with the chosen pages and More", () => {
    renderShell({ tabs: ["/app", "/app/students"] });
    const bar = screen.getByRole("navigation", { name: "Quick menu" });
    expect(within(bar).getAllByRole("link").map((l) => l.textContent)).toEqual(["Dashboard", "Students"]);
    expect(within(bar).getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("opens the command palette with Ctrl+K, finds records and pages, and goes there", async () => {
    const run = vi.fn(async (q: string) => [{ id: "s1", href: "/app/students/s1", title: `Anika (${q})`, subtitle: "2026-0003" }]);
    renderShell({ search: { label: "Students", placeholder: "Search students", run } });
    await userEvent.keyboard("{Control>}k{/Control}");
    const input = await screen.findByPlaceholderText("Search students");
    await userEvent.type(input, "ani");
    const result = await screen.findByRole("option", { name: /Anika \(ani\)/ });
    expect(run).toHaveBeenCalledWith("ani", expect.any(AbortSignal));
    await userEvent.click(result);
    expect(push).toHaveBeenCalledWith("/app/students/s1");
  });

  it("filters pages in the palette", async () => {
    renderShell();
    await act(async () => {
      await userEvent.click(screen.getAllByRole("button", { name: /Search/ })[0]!);
    });
    await userEvent.type(await screen.findByRole("combobox"), "cour");
    expect(screen.getByRole("option", { name: /Courses & batches/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Students/ })).not.toBeInTheDocument();
  });

  it("collapses the sidebar to icons and remembers it", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Collapse menu" }));
    expect(screen.getByRole("button", { name: "Expand menu" })).toBeInTheDocument();
    expect(window.localStorage.getItem("cms.sidebar-collapsed")).toBe("1");
    await userEvent.click(screen.getByRole("button", { name: "Expand menu" }));
    expect(window.localStorage.getItem("cms.sidebar-collapsed")).toBe("0");
  });
});

describe("activeHref", () => {
  it("prefers the longest matching item and respects exact items", () => {
    expect(activeHref("/app", NAV)).toBe("/app");
    expect(activeHref("/app/students/1", NAV)).toBe("/app/students");
    expect(activeHref("/app/unknown", NAV)).toBeUndefined();
  });
});
