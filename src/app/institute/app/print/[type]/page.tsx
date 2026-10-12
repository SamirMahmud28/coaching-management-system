import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintDocument } from "@/components/documents/print-document";
import { TEMPLATES } from "@/modules/institute/components/documents/template-registry";
import { db } from "@/server/core/db/client";
import { NotFoundError, ValidationError } from "@/server/core/errors";
import { getDocumentType } from "@/server/modules/documents/registry";
import { preparePrint, type PreparedPrint } from "@/server/modules/documents/pipeline";
import { requirePrintPage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Print" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The one print route for every document type. Access (module, permission or own records), selection, loading and
 * the audit entry are the pipeline's; this page only lays the result out.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<SearchParams> }) {
  const type = getDocumentType((await params).type);
  if (!type) notFound();
  const { session, permissions, activeModules } = await requirePrintPage();
  const query = Object.fromEntries(Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));

  let job: PreparedPrint;
  try {
    job = await preparePrint(db, { tenantId: session.tenant.id, userId: session.userId, permissions, activeModules }, type, query);
  } catch (err) {
    if (err instanceof NotFoundError) {
      // No access looks like an unknown type; a specific reason (e.g. "receipt not found") is shown.
      if (err.code === "NOT_FOUND_DOCUMENT_TYPE") notFound();
      return <Problem message={err.message} />;
    }
    if (err instanceof ValidationError) return <Problem message={err.message} />;
    throw err;
  }

  const Template = TEMPLATES[type.key];
  if (!Template) notFound();
  return <PrintDocument job={job} Template={Template} />;
}

function Problem({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold">Can&apos;t print this</h1>
      <p role="alert" className="mt-2 text-muted-foreground">
        {message}
      </p>
    </main>
  );
}
