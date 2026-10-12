import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeekSchedule } from "@/modules/institute/components/portal/week-schedule";
import { db } from "@/server/core/db/client";
import { requireModulePage } from "@/server/modules/institute/current-user";
import { getInstructorHome } from "@/server/modules/portal/service";

export const metadata: Metadata = { title: "Instructor portal" };

// The instructor's own batches and week (D24), with a shortcut to today's registers when Attendance is on.
export default async function Page() {
  const { session, permissions } = await requireModulePage("batches.own.view", "instructor");
  const home = await getInstructorHome(db, session.tenant.id, session.userId);

  return (
    <>
      <PageHeader
        title={`Welcome, ${home.fullName}`}
        description={session.tenant.name}
        actions={
          permissions.has("attendance.view") ? (
            <Button asChild>
              <Link href="/app/instructor/attendance">
                <CalendarCheck /> Today&apos;s attendance
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My batches</CardTitle>
          </CardHeader>
          <CardContent>
            {home.batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">You aren&apos;t teaching any batch yet. The office assigns instructors to batches.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {home.batches.map((b) => (
                  <li key={b.id}>
                    <Link href={`/app/instructor/batches/${b.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {b.name} <span className="font-normal text-muted-foreground">· {b.courseName}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {b.mySubjects.join(", ")} · {b.studentCount} {b.studentCount === 1 ? "student" : "students"}
                        </p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>My week</CardTitle>
          </CardHeader>
          <CardContent>
            <WeekSchedule classes={home.week} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
