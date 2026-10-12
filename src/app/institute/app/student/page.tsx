import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { WeekSchedule, classTimes } from "@/modules/institute/components/portal/week-schedule";
import { GENDER_LABEL, RELATION_LABEL } from "@/modules/institute/student-labels";
import { db } from "@/server/core/db/client";
import { requireModulePage } from "@/server/modules/institute/current-user";
import { getStudentHome } from "@/server/modules/portal/service";

export const metadata: Metadata = { title: "Student portal" };

// The student's own record, batches and week (D27, Core part). Attendance, results and fees join when those modules exist.
export default async function Page() {
  const { session } = await requireModulePage("student.self.view", "student");
  const { profile, batches, pastBatches, week } = await getStudentHome(db, session.tenant.id, session.userId);

  const details: [string, string][] = [
    ["Student ID", profile.studentCode],
    ["Gender", GENDER_LABEL[profile.gender]],
    ["Date of birth", profile.dateOfBirth ? formatDate(profile.dateOfBirth) : "—"],
    ["Mobile", profile.phone ?? "—"],
    ["School or college", [profile.schoolName, profile.schoolClass].filter(Boolean).join(", ") || "—"],
    ["Guardian", `${profile.guardianName} (${RELATION_LABEL[profile.guardianRelation]}) · ${profile.guardianPhone}`],
    ["Address", profile.address ?? "—"],
    ["Admitted", formatDate(profile.admissionDate)],
  ];

  return (
    <>
      <div className="flex items-start gap-4">
        <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {profile.photoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated, tenant-scoped bytes
            <img src={`/api/v1/files/${profile.photoFileId}`} alt="" className="size-full object-cover" />
          ) : (
            <UserRound aria-hidden className="size-6 text-muted-foreground" />
          )}
        </div>
        <PageHeader
          className="min-w-0 flex-1"
          title={
            <span className="flex flex-wrap items-center gap-3">
              {profile.fullName} <StatusBadge status={profile.status} />
            </span>
          }
          description={session.tenant.name}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>My batches</CardTitle>
            </CardHeader>
            <CardContent>
              {batches.length === 0 ? (
                <p className="text-sm text-muted-foreground">You aren&apos;t in a batch yet.</p>
              ) : (
                <div className="space-y-5">
                  {batches.map((b) => (
                    <section key={b.batchId} className="space-y-2" data-testid="my-batch">
                      <h3 className="font-medium">
                        {b.batchName} <span className="font-normal text-muted-foreground">· {b.courseName}</span>
                        {b.rollNumber && <span className="font-normal text-muted-foreground"> · Roll {b.rollNumber}</span>}
                      </h3>
                      <ul className="space-y-2 text-sm">
                        {b.subjects.map((s) => (
                          <li key={s.subjectName} className="rounded-md border px-3 py-2">
                            <p className="font-medium">{s.subjectName}</p>
                            <p className="text-muted-foreground">{s.instructors.join(", ") || "Instructor to be announced"}</p>
                            <p className="text-muted-foreground">{classTimes(s.slots)}</p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              {pastBatches.length > 0 && (
                <div className="mt-5 space-y-1 border-t pt-4 text-sm">
                  <p className="text-muted-foreground">Earlier batches</p>
                  {pastBatches.map((b, i) => (
                    <p key={i}>
                      {b.batchName} · {b.courseName} · {formatDate(b.startedOn)} – {b.endedOn ? formatDate(b.endedOn) : "—"} <StatusBadge status={b.status} />
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>My week</CardTitle>
            </CardHeader>
            <CardContent>
              <WeekSchedule classes={week} />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>My details</CardTitle>
            <CardDescription>Something wrong? Ask the office to correct it.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[9rem_1fr]">
              {details.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 wrap-break-word">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
