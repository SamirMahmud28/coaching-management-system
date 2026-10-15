// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayoutDashboard } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemePicker } from "./theme-picker";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/settings", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.appTheme;
});

function inShell(node: React.ReactNode, theme: "MIDNIGHT" | "PLUM" = "MIDNIGHT") {
  return render(
    <TooltipProvider>
      <AppShell
        nav={[{ href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true }]}
        appLabel="Alo"
        user={{ name: "Owner" }}
        onSignOut={vi.fn()}
        theme={theme}
      >
        {node}
      </AppShell>
    </TooltipProvider>,
  );
}

const shellRoot = () => document.body.querySelector(".min-h-screen")!;

describe("ThemePicker", () => {
  it("lists the five themes, marking the current one", () => {
    render(<ThemePicker value="AMBER" onSave={vi.fn()} />);
    const options = screen.getAllByRole("radio");
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Midnight & Gold"),
      expect.stringContaining("Classic Amber"),
      expect.stringContaining("Royal Indigo"),
      expect.stringContaining("Emerald & Gold"),
      expect.stringContaining("Plum & Coral"),
    ]);
    expect(screen.getByRole("radio", { name: /Classic Amber/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Save theme" })).toBeDisabled();
  });

  it("previews a theme across the app, cancels back, and saves the chosen key", async () => {
    const onSave = vi.fn(async () => {});
    inShell(<ThemePicker value="MIDNIGHT" onSave={onSave} livePreview />);
    expect(document.documentElement.dataset.appTheme).toBeUndefined();

    await userEvent.click(screen.getByRole("radio", { name: /Plum & Coral/ }));
    expect(document.documentElement.dataset.appTheme).toBe("plum");
    expect(screen.getByText(/You are previewing this look/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.documentElement.dataset.appTheme).toBeUndefined();

    await userEvent.click(screen.getByRole("radio", { name: /Royal Indigo/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save theme" }));
    expect(onSave).toHaveBeenCalledWith("INDIGO", null);
    await waitFor(() => expect(document.documentElement.dataset.appTheme).toBe("indigo"));
  });

  it("the paper switch is automatic (on with Classic Amber), previews on the shell, and saves the explicit choice (D158)", async () => {
    const onSave = vi.fn(async () => {});
    inShell(<ThemePicker value="MIDNIGHT" onSave={onSave} livePreview />);
    const paper = screen.getByRole("switch", { name: "Paper background" });
    expect(paper).not.toBeChecked();
    expect(shellRoot()).not.toHaveAttribute("data-paper");

    await userEvent.click(screen.getByRole("radio", { name: /Classic Amber/ }));
    expect(paper).toBeChecked(); // automatic
    expect(shellRoot()).toHaveAttribute("data-paper", "on");

    await userEvent.click(paper);
    expect(paper).not.toBeChecked();
    expect(shellRoot()).not.toHaveAttribute("data-paper");
    await userEvent.click(screen.getByRole("button", { name: "Save theme" }));
    expect(onSave).toHaveBeenCalledWith("AMBER", false);
  });

  it("without live preview, choosing does not change the app (the Super Admin choosing for an institute)", async () => {
    inShell(<ThemePicker value="MIDNIGHT" onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: /Emerald & Gold/ }));
    expect(document.documentElement.dataset.appTheme).toBeUndefined();
  });
});

describe("AppShell theme", () => {
  it("puts the institute's theme on the shell and on <html>, and removes it on unmount", () => {
    const { unmount } = inShell(<p>Body</p>, "PLUM");
    expect(shellRoot()).toHaveAttribute("data-app-theme", "plum");
    expect(document.documentElement.dataset.appTheme).toBe("plum");
    unmount();
    expect(document.documentElement.dataset.appTheme).toBeUndefined();
  });
});
