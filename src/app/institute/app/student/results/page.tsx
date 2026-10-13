import type { Metadata } from "next";
import { MyResultsPage, type MyResultsWire } from "@/modules/institute/components/portal/my-results-page";
import { db } from "@/server/core/db/client";
import { toSnakeCaseKeys } from "@/server/core/http/case";
import { myResults } from "@/server/modules/exams/results";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Results" };

// The student's own published results (D27). 404 when Exams is off.
export default async function Page() {
  const { session } = await requireModulePage("exams.self.view", "student");
  const data = toSnakeCaseKeys(await myResults(db, session.tenant.id, session.userId)) as MyResultsWire;
  return <MyResultsPage data={data} />;
}
