import type { ComponentType, ReactNode } from "react";
import type { TemplateProps } from "@/server/core/documents/types";
import type { PreparedPrint } from "@/server/modules/documents/pipeline";
import { PrintToolbar } from "./print-toolbar";

const A4 = { widthMm: 210, heightMm: 297 };

/**
 * Lays a prepared print run out on paper: A4 documents one or two per page (with a cut line between halves), or
 * reports that flow over as many A4 pages as they need. Only this component positions things on paper.
 */
export function PrintDocument({ job, Template }: { job: PreparedPrint; Template: ComponentType<TemplateProps> }) {
  const render = (data: unknown) => <Template record={data} branding={job.branding} context={job.context} />;
  let pages: ReactNode[];
  let summary: string;
  const flow = job.type.format.kind === "a4-flow";

  if (job.type.format.kind === "a4-flow") {
    // The browser paginates: each record starts a page; the template's table headers repeat on every page.
    pages = job.records.map((r) => (
      <section key={r.id} className="doc-flow">
        {render(r.data)}
      </section>
    ));
    summary = "A4, as many pages as needed";
  } else {
    const perPage = job.type.format.perPage;
    const slotHeight = A4.heightMm / perPage;
    const groups: (typeof job.records)[] = [];
    for (let i = 0; i < job.records.length; i += perPage) groups.push(job.records.slice(i, i + perPage));
    pages = groups.map((group, i) => (
      <section key={i} className="doc-page" style={{ position: "relative", width: `${A4.widthMm}mm`, height: `${A4.heightMm}mm`, overflow: "hidden", background: "#fff" }}>
        {group.map((r, slot) => (
          <div
            key={r.id}
            style={{ position: "absolute", left: 0, top: `${slot * slotHeight}mm`, width: `${A4.widthMm}mm`, height: `${slotHeight}mm`, overflow: "hidden", fontSize: perPage === 2 ? "8.5pt" : "10.5pt" }}
          >
            {render(r.data)}
          </div>
        ))}
        {perPage === 2 && <div aria-hidden style={{ position: "absolute", left: "8mm", right: "8mm", top: `${slotHeight}mm`, borderTop: "0.2mm dashed #9ca3af" }} />}
      </section>
    ));
    summary = perPage === 1 ? "one per A4 page" : "two per A4 page";
  }

  const pageCss = `@page { size: A4; margin: ${flow ? "12mm 12mm 14mm" : "0"}; }
    .doc-flow { font-size: 9.5pt; line-height: 1.35; background: #fff; }
    .doc-flow thead { display: table-header-group; }
    .doc-flow tr { break-inside: avoid; }
    @media screen { .doc-flow { width: ${A4.widthMm}mm; min-height: ${A4.heightMm}mm; box-sizing: border-box; padding: 12mm; margin: 0 auto 16px; box-shadow: 0 1px 4px rgba(0,0,0,.25); } }
    @media print { .doc-flow { break-after: page; } .doc-flow:last-child { break-after: auto; } }
    html, body { background: #fff !important; }
    .doc-root { color: #111827; font-family: var(--font-inter), var(--font-noto-bengali), system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media screen { .doc-root { background: #e5e7eb; min-height: 100vh; padding: 16px 0 32px; } .doc-page { margin: 0 auto 16px; box-shadow: 0 1px 4px rgba(0,0,0,.25); } }
    @media print { .doc-page { break-after: page; } .doc-page:last-child { break-after: auto; } }`;

  return (
    <div className="doc-root">
      <style>{pageCss}</style>
      <PrintToolbar title={job.type.label} count={job.records.length} summary={summary} />
      {job.records.length === 0 ? (
        <p role="status" style={{ textAlign: "center", padding: "48px 16px", color: "#374151" }}>
          Nothing to print for this selection.
        </p>
      ) : (
        <main aria-label={`${job.type.label} print preview`}>{pages}</main>
      )}
    </div>
  );
}
