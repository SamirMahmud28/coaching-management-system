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
});
