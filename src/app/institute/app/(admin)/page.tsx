import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PAID_MODULE_NAV } from "@/modules/institute/modules";
import { db } from "@/server/core/db/client";
import { requirePortal } from "@/server/modules/institute/current-user";
import { getDashboardCounts } from "@/server/modules/portal/service";

export const metadata: Metadata = { title: "Dashboard" };

// Each count shows only to someone who may open that list.
export default async function InstituteDashboardPage() {
  const { session, permissions } = await requirePortal("admin");
  const modules = Object.values(PAID_MODULE_NAV).filter((m) => permissions.has(m.permission));
  const counts = await getDashboardCounts(db, session.tenant.id);
  const stats = [
    ...(permissions.has("students.view")
      ? [
          { label: "Active students", value: counts.students.active, href: "/app/students" },
          { label: "On hold", value: counts.students.onHold, href: "/app/students" },
          { label: "All students", value: counts.students.total, href: "/app/students" },
        ]
      : []),
    ...(permissions.has("academic.view")
      ? [
          { label: "Active batches", value: counts.activeBatches, href: "/app/courses" },
          { label: "Active courses", value: counts.activeCourses, href: "/app/courses" },
        ]
      : []),
    ...(permissions.has("instructors.view") ? [{ label: "Active instructors", value: counts.activeInstructors, href: "/app/instructors" }] : []),
  ];

  return (
    <>
      <PageHeader title={`Welcome, ${session.name}`} description={session.tenant.name} />
      {stats.length > 0 && (
        <section aria-label="At a glance" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="rounded-lg border p-4 transition-colors hover:bg-accent/40">
              <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </Link>
          ))}
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Your modules</h2>
        {modules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No paid modules are switched on for your institute yet. You can request one from Modules.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="rounded-lg transition-colors hover:bg-accent/40">
                <Card className="h-full">
                  <CardHeader className="flex flex-row items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary-strong">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <CardTitle className="text-base">{label}</CardTitle>
                      <CardDescription>Open</CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
