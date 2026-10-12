"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Screen-only bar above a print run. Printing is the browser's own dialog, which also offers Save as PDF. */
export function PrintToolbar({ title, count, summary }: { title: string; count: number; summary: string }) {
  return (
    <div className="print:hidden" style={{ position: "sticky", top: 0, zIndex: 10, marginBottom: 16, background: "#fff", borderBottom: "1px solid #d1d5db" }}>
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-2" style={{ color: "#111827" }}>
        <div>
          <h1 className="text-base font-semibold">{title}</h1>
          <p className="text-sm" style={{ color: "#4b5563" }}>
            {count} {count === 1 ? "document" : "documents"}
            {summary && ` · ${summary}`}
          </p>
        </div>
        <Button onClick={() => window.print()} disabled={count === 0}>
          <Printer aria-hidden />
          Print
        </Button>
      </div>
    </div>
  );
}
