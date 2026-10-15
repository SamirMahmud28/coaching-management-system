import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { classTimes } from "@/modules/institute/components/portal/week-schedule";
import { db } from "@/server/core/db/client";
import { isUuid } from "@/server/core/db/tenant-scope";
import { NotFoundError } from "@/server/core/errors";
import { requireModulePage } from "@/server/modules/institute/current-user";
import { getInstructorBatch } from "@/server/modules/portal/service";

export const metadata: Metadata = { title: "Batch" };

// Only a batch the instructor teaches; any other id is a 404. Students show roll, ID, name, photo and school.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { session } = await requireModulePage("batches.own.view", "instructor");
  const batch = await getInstructorBatch(db, session.tenant.id, session.userId, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });

  return (
    <>
      <Link href="/app/instructor" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> My batches
      </Link>
      <PageHeader title={batch.name} description={`${batch.courseName} (${batch.courseCode})`} />
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Subjects</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {batch.subjects.map((s) => (
                <li key={s.subjectName}>
                  <p className="font-medium">{s.subjectName}</p>
                  <p className="text-muted-foreground">{s.instructors.join(", ") || "No instructor yet"}</p>
                  <p className="text-muted-foreground">{classTimes(s.slots)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Students ({batch.students.length})</CardTitle>
            <CardDescription>Contact details are kept by the office.</CardDescription>
          </CardHeader>
          <CardContent>
            {batch.students.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students in this batch yet.</p>
            ) : (
              <ul className="surface-glass-dense divide-y rounded-md border" data-testid="roster">
                {batch.students.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-8 font-mono text-muted-foreground">{s.rollNumber ?? "—"}</span>
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                      {s.photoFileId ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authenticated, tenant-scoped bytes
                        <img src={`/api/v1/files/${s.photoFileId}`} alt="" className="size-full object-cover" />
                      ) : (
                        <UserRound aria-hidden className="size-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{s.studentCode}</span>
                        {s.schoolName || s.schoolClass ? ` · ${[s.schoolName, s.schoolClass].filter(Boolean).join(", ")}` : ""}
                      </p>
                    </div>
                    {s.status !== "ACTIVE" && <StatusBadge status={s.status} />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
