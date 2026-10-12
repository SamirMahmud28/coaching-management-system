// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TemplateProps } from "@/server/core/documents/types";
import type { PreparedPrint } from "@/server/modules/documents/pipeline";
import { PrintDocument } from "./print-document";

afterEach(cleanup);

const branding = { name: "Prottoy", shortName: null, address: null, phone: null, email: null, website: null, logoUrl: null, primaryColor: "#000", secondaryColor: "#111", signatories: [] };
const job = (format: PreparedPrint["type"]["format"], count: number): PreparedPrint => ({
  type: { key: "fee-receipt", label: "Receipts", format },
  branding,
  context: {},
  records: Array.from({ length: count }, (_, i) => ({ id: `r${i}`, data: { n: i + 1 } })),
});
const Template = ({ record, branding: b }: TemplateProps) => <p>{`${b.name} #${(record as { n: number }).n}`}</p>;

describe("PrintDocument", () => {
  it("puts half-page documents two to an A4 page", () => {
    const { container } = render(<PrintDocument job={job({ kind: "a4", perPage: 2 }, 3)} Template={Template} />);
    expect(container.querySelectorAll(".doc-page")).toHaveLength(2);
    expect(screen.getByText("Prottoy #3")).toBeInTheDocument();
    expect(screen.getByText("3 documents · two per A4 page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
  });

  it("starts each report on its own flowing page", () => {
    const { container } = render(<PrintDocument job={job({ kind: "a4-flow" }, 2)} Template={Template} />);
    expect(container.querySelectorAll(".doc-flow")).toHaveLength(2);
  });

  it("says so when there is nothing to print", () => {
    render(<PrintDocument job={job({ kind: "a4", perPage: 1 }, 0)} Template={Template} />);
    expect(screen.getByRole("status")).toHaveTextContent("Nothing to print for this selection.");
    expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
  });
});
