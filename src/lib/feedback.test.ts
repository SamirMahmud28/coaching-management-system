import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ApiError } from "./api-client";
import { describeError, runAction, submitForm } from "./feedback";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const form = () => {
  const errors: Record<string, string> = {};
  return {
    errors,
    api: {
      getValues: () => ({ name: "", code: "" }),
      setError: (field: string, error: { message?: string }) => {
        errors[field] = error.message ?? "";
      },
    },
  };
};

beforeEach(() => vi.clearAllMocks());

describe("describeError", () => {
  it("uses the server message, and lists what a dependency error is blocked by", () => {
    expect(describeError(new ApiError(409, "CONFLICT_SUBJECT_NAME", "A subject named 'Maths' already exists for Class 10."))).toBe("A subject named 'Maths' already exists for Class 10.");
    const inUse = new ApiError(409, "CONFLICT_CLASS_IN_USE", "This record is in use and can't be changed or deleted.", { references: [{ type: "students", count: 3 }, { type: "sections", count: 2 }] });
    expect(describeError(inUse)).toBe("This record is in use and can't be changed or deleted. It's in use: 3 students, 2 sections. Remove those first.");
  });

  it("explains system records and never leaks unknown errors", () => {
    expect(describeError(new ApiError(409, "CONFLICT_SYSTEM_RECORD", "x"))).toContain("default record");
    expect(describeError(new Error("SELECT * FROM secrets"))).toBe("Something went wrong. Please try again.");
  });
});

describe("submitForm", () => {
  it("toasts success and resolves true", async () => {
    const f = form();
    expect(await submitForm(f.api as never, async () => undefined, { success: "Added." })).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Added.");
  });

  it("puts a server validation error on the named field and toasts it", async () => {
    const f = form();
    const err = new ApiError(409, "CONFLICT_SUBJECT_CODE", "Subject code 'M1' already exists for Class 10.", { field: "code" });
    expect(await submitForm(f.api as never, async () => Promise.reject(err))).toBe(false);
    expect(f.errors.code).toBe("Subject code 'M1' already exists for Class 10.");
    expect(toast.error).toHaveBeenCalledWith("Subject code 'M1' already exists for Class 10.");
  });

  it("toasts errors that name no form field, so nothing fails silently", async () => {
    const f = form();
    expect(await submitForm(f.api as never, async () => Promise.reject(new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server.")))).toBe(false);
    expect(f.errors).toEqual({});
    expect(toast.error).toHaveBeenCalledWith("Couldn't reach the server.");
  });
});

describe("runAction", () => {
  it("routes a 409 to onBlocked (the delete-blocked dialog) instead of a toast", async () => {
    const onBlocked = vi.fn();
    const err = new ApiError(409, "CONFLICT_CLASS_IN_USE", "In use", { references: [{ type: "students", count: 1 }] });
    expect(await runAction(async () => Promise.reject(err), { onBlocked })).toBe(false);
    expect(onBlocked).toHaveBeenCalledWith(err);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts other failures and success", async () => {
    expect(await runAction(async () => Promise.reject(new ApiError(500, "INTERNAL_ERROR", "Boom")), { onBlocked: vi.fn() })).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Boom");
    expect(await runAction(async () => undefined, { success: "Deleted." })).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Deleted.");
  });
});
