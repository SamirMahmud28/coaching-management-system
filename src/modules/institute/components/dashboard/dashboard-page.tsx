"use client";

import { PageHeader } from "@/components/shared/page-header";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { BatchAttendanceGrid } from "./batch-attendance-grid";
import { FeeCollectionChart } from "./fee-collection-chart";
import { KpiRow } from "./kpi-row";
import { ComingUp, NoticesCard, PendingActions, SetupChecklist } from "./side-widgets";
import { TodaysClasses } from "./todays-classes";

/**
 * The admin "Today" dashboard. Every widget appears only for someone holding its permission (already limited
 * to the institute's active modules) and loads on its own, so one slow or failing figure never blanks the page.
 */
export function DashboardPage({ name, subtitle, permissions }: { name: string; subtitle: string; permissions: string[] }) {
  const has = (...p: string[]) => p.some((x) => permissions.includes(x));
  const main = [
    has("attendance.report.view") && <BatchAttendanceGrid key="grid" />,
    has("attendance.view") && <TodaysClasses key="classes" />,
    has("fees.report.view") && <FeeCollectionChart key="fees" />,
  ].filter(Boolean);
  const pendingVisible = has("attendance.take", "leave.manage", "exams.publish", "exams.manage", "website.manage", "fees.report.view");
  const side = [
    has("academic.manage") && <SetupChecklist key="setup" />,
    pendingVisible && <PendingActions key="pending" />,
    has("website.manage") && <NoticesCard key="notices" />,
    has("exams.view", "routine.view") && <ComingUp key="upcoming" />,
  ].filter(Boolean);

  return (
    <>
      <PageHeader title={`Welcome back, ${name}`} description={subtitle} />
      <HowThisWorks topic="dashboard" />
      <KpiRow showPending={pendingVisible} />
      {(main.length > 0 || side.length > 0) && (
        <div className={main.length && side.length ? "grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "grid gap-6"}>
          {main.length > 0 && <div className="min-w-0 space-y-6">{main}</div>}
          {side.length > 0 && <aside aria-label="For your attention" className="min-w-0 space-y-6">{side}</aside>}
        </div>
      )}
    </>
  );
}
