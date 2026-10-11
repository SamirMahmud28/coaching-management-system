import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PAID_MODULE_NAV } from "@/modules/institute/modules";
import { requirePortal } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Dashboard" };

// Counts of students, batches and instructors arrive with those records (M4–M7).
export default async function InstituteDashboardPage() {
  const { session, permissions } = await requirePortal("admin");
  const modules = Object.values(PAID_MODULE_NAV).filter((m) => permissions.has(m.permission));

  return (
    <>
      <PageHeader title={`Welcome, ${session.name}`} description={session.tenant.name} />
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
