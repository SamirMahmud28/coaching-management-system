import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { HELP_TOPICS, type HelpTopic } from "@/modules/institute/help/content";
import { HelpGuide } from "@/modules/institute/help/help-guide";
import { requirePortal } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Help" };

const AREAS: HelpTopic["area"][] = ["Getting started", "Teaching", "Students", "Staff and access", "Institute", "Fees", "Attendance", "Exams", "Routine", "Website"];

/**
 * The Help centre (D96): a guide for every feature this user can use (permissions are already limited to the
 * institute's active modules), in setup order, from the same text as each page's "How this works" panel. Each guide is
 * collapsed until clicked (D98).
 */
export default async function Page() {
  const { permissions } = await requirePortal("admin");
  const topics = HELP_TOPICS.filter((t) => t.permission === null || permissions.has(t.permission));

  return (
    <>
      <PageHeader title="Help" description="How each part of the system works. Click a guide to see its steps, the rules it follows, and common questions." />
      {AREAS.map((area) => {
        const inArea = topics.filter((t) => t.area === area);
        if (!inArea.length) return null;
        return (
          <section key={area} className="space-y-3">
            <h2 className="text-lg font-semibold">{area}</h2>
            {inArea.map((t) => (
              <HelpGuide key={t.key} topic={t} />
            ))}
          </section>
        );
      })}
    </>
  );
}
