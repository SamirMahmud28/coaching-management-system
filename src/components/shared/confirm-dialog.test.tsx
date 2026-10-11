// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("runs onConfirm then closes", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<ConfirmDialog open onOpenChange={onOpenChange} title="Suspend institute?" confirmLabel="Suspend" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("button", { name: "Suspend" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("cancel closes without confirming", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<ConfirmDialog open onOpenChange={onOpenChange} title="Suspend institute?" onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open and shows the error when onConfirm fails", async () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Suspend institute?" confirmLabel="Suspend" onConfirm={() => Promise.reject(new Error("A reason is required."))} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Suspend" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A reason is required.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("explains an in-use conflict with what references the record", async () => {
    const error = new ApiError(409, "CONFLICT_CLASS_IN_USE", "This record is in use and can't be changed or deleted.", {
      references: [{ type: "students", count: 3 }],
    });
    render(<ConfirmDialog open onOpenChange={vi.fn()} title="Delete class?" confirmLabel="Delete" onConfirm={() => Promise.reject(error)} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("It's in use: 3 students. Remove those first.");
  });

  it("disables confirm while confirmDisabled is set", () => {
    render(<ConfirmDialog open onOpenChange={vi.fn()} title="t" confirmLabel="Go" confirmDisabled onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Go" })).toBeDisabled();
  });
});
