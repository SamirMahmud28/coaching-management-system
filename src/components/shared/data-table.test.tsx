// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable, type Column } from "./data-table";

afterEach(cleanup);

type Row = { id: string; name: string };
const columns: Column<Row>[] = [{ key: "name", header: "Name", cell: (r) => r.name }];
const rows: Row[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta" },
];

describe("DataTable", () => {
  it("renders rows", () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("pages forward and back, disabling the buttons at either end", async () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} pagination={{ page: 1, pageSize: 2, total: 5, onPageChange }} />,
    );
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    rerender(
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} pagination={{ page: 3, pageSize: 2, total: 5, onPageChange }} />,
    );
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it("hides pagination when everything fits on one page", () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} pagination={{ page: 1, pageSize: 25, total: 2, onPageChange: vi.fn() }} />);
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });

  it("shows loading, error-with-retry and empty states instead of a blank table", async () => {
    const { rerender } = render(<DataTable columns={columns} rows={undefined} getRowId={(r) => r.id} isLoading />);
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();

    const onRetry = vi.fn();
    rerender(<DataTable columns={columns} rows={undefined} getRowId={(r) => r.id} error={new Error("Boom")} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();

    rerender(<DataTable columns={columns} rows={[]} getRowId={(r) => r.id} empty={<p>No tenants yet</p>} />);
    expect(screen.getByText("No tenants yet")).toBeInTheDocument();
  });

  it('sorts by a sortable column: ascending, then descending, then back to the original order', async () => {
    const cols: Column<Row>[] = [{ key: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name }];
    const data: Row[] = [{ id: '1', name: 'Beta' }, { id: '2', name: 'Alpha' }, { id: '3', name: 'Gamma' }];
    render(<DataTable columns={cols} rows={data} getRowId={(r) => r.id} />);
    const names = () => screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    const header = screen.getByRole('columnheader', { name: /Name/ });
    expect(header).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(names()).toEqual(['Gamma', 'Beta', 'Alpha']);
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(names()).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('shows cards instead of the table on a phone when a card layout is given', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const onRowClick = vi.fn();
      render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} onRowClick={onRowClick} card={(r) => <span>Card {r.name}</span>} caption='People' />);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'People' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Card Beta' }));
      expect(onRowClick).toHaveBeenCalledWith(rows[1]);
    } finally {
      window.matchMedia = original;
    }
  });
});
