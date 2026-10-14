// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Users } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatePicker, parseIsoDate, toIsoDate } from "./date-picker";
import { SectionCard } from "./section-card";
import { StatCard } from "./stat-card";
import { EmptyState } from "./states";
import { StickyActionBar } from "./sticky-action-bar";

afterEach(cleanup);

describe("StatCard", () => {
  it("shows the label, value and a signed trend, and links when given an href", () => {
    render(<StatCard label="Students" value="1,240" icon={Users} trend={{ value: 12, label: "vs last month" }} href="/app/students" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/app/students");
    expect(link).toHaveTextContent("Students");
    expect(link).toHaveTextContent("1,240");
    expect(link).toHaveTextContent("+12%");
    expect(link).toHaveTextContent("vs last month");
  });

  it("is a plain block without an href", () => {
    render(<StatCard label="Dues" value="৳ 5,000" trend={{ value: -3, goodWhen: "down" }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("-3%")).toBeInTheDocument();
  });
});

describe("SectionCard", () => {
  it("renders a titled section with its actions", () => {
    render(
      <SectionCard title="Today's classes" actions={<button>See all</button>}>
        <p>Body</p>
      </SectionCard>,
    );
    expect(screen.getByRole("heading", { name: "Today's classes", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See all" })).toBeInTheDocument();
  });
});

describe("StickyActionBar", () => {
  it("is a labelled region with a live summary and its buttons", () => {
    render(
      <StickyActionBar label="Register actions" summary="28 present · 2 absent">
        <button>Save</button>
      </StickyActionBar>,
    );
    const region = screen.getByRole("region", { name: "Register actions" });
    expect(region).toHaveTextContent("28 present · 2 absent");
    expect(screen.getByText("28 present · 2 absent")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("shows the title, the hint and the action; the illustration is hidden from screen readers", () => {
    const { container } = render(<EmptyState title="No students yet" description="Admit your first student." action={<button>Admit</button>} />);
    expect(screen.getByText("No students yet")).toBeInTheDocument();
    expect(screen.getByText("Admit your first student.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Admit" })).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true'] svg")).not.toBeNull();
  });
});

describe("DatePicker", () => {
  it("round-trips YYYY-MM-DD without a time-zone shift", () => {
    expect(toIsoDate(parseIsoDate("2026-01-31")!)).toBe("2026-01-31");
    expect(parseIsoDate("31/01/2026")).toBeUndefined();
    expect(parseIsoDate("")).toBeUndefined();
  });

  it("shows the date and picks a new one from the calendar", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-10-14" onChange={onChange} aria-label="Exam date" />);
    const trigger = screen.getByRole("button", { name: "Exam date" });
    expect(trigger).toHaveTextContent("14 Oct 2026");
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("button", { name: /October 20th, 2026/ }));
    expect(onChange).toHaveBeenCalledWith("2026-10-20");
  });
});
