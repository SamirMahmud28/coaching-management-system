// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Eye } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActionIcons, pageWindow, RecordTable, type RecordColumn } from "./record-list";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/students", useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);

type Row = { id: string; name: string };
const rows: Row[] = [
  { id: "a", name: "Anika" },
  { id: "b", name: "Babul" },
];
const columns: RecordColumn<Row>[] = [
  { key: "sl", header: "SL", cell: (_, n) => n },
  { key: "name", header: "Student", cell: (r) => r.name },
  { key: "action", header: "Action", cell: (r) => <ActionIcons name={r.name} actions={[{ label: "View", icon: Eye, href: `/app/students/${r.id}` }]} /> },
];

function renderTable(extra: Partial<React.ComponentProps<typeof RecordTable<Row>>> = {}) {
  const props = {
    label: "Students",
    columns,
    rows,
    getRowId: (r: Row) => r.id,
    empty: <p>None</p>,
    page: 2,
    pageSize: 10,
    total: 42,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    search: { value: "", onChange: vi.fn(), placeholder: "Name or ID", label: "Search students" },
    ...extra,
  };
  render(
    <TooltipProvider>
      <RecordTable<Row> {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe("record list (EMS layout)", () => {
  it("numbers rows across pages and shows the entries summary and page buttons", () => {
    renderTable();
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("11");
    expect(screen.getByText("Showing 11 To 20 Of 42 Entries")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Search students")).toBeInTheDocument();
  });

  it("opens the record on a row click, but not when an action icon is used", async () => {
    const onRowClick = vi.fn();
    renderTable({ onRowClick });
    await userEvent.click(screen.getByText("Anika"));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    onRowClick.mockClear();
    await userEvent.click(screen.getByRole("link", { name: "View Babul" }));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("windows the page numbers around the current page", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([3, 4, 5, 6, 7]);
    expect(pageWindow(10, 10)).toEqual([6, 7, 8, 9, 10]);
  });
});
