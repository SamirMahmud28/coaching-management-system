"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { EXAM_KIND_LABEL, examsApi, type ExamState } from "../../api";
import { instituteKeys } from "../../keys";
import { EXAM_STATE, ExamsTabs } from "./exams-tabs";

const FILTERS: { value: ExamState | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
];

const dates = (from: string, to: string) => (from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`);

/** Exams, newest first: the office sees every exam, an instructor those of batches they teach. */
export function ExamsListPage({ base, canManage, fullGuide = true }: { base: string; canManage: boolean; fullGuide?: boolean }) {
  const [state, setState] = useState<ExamState | "">("");
  const q = state ? { state } : {};
  const list = useQuery({ queryKey: instituteKeys.exams(q), queryFn: () => examsApi.list(q) });

  return (
    <>
      <PageHeader
        title="Exams"
        description="Exams with their papers, marks and results."
        actions={
          canManage ? (
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus /> New exam
              </Link>
            </Button>
          ) : null
        }
      />
      <ExamsTabs canManage={canManage} />
      <HowThisWorks topic="exams-setup" fullGuide={fullGuide} />
      <div className="flex gap-1" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <Button key={f.label} size="sm" variant={state === f.value ? "default" : "outline"} aria-pressed={state === f.value} onClick={() => setState(f.value)}>
            {f.label}
          </Button>
        ))}
      </div>
      {list.isPending ? (
        <LoadingState rows={4} />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No exams yet" description={canManage ? "Create an exam for one or more batches of a course." : "Exams of your batches appear here once the office creates them."} />
      ) : (
        <ul className="surface-glass-dense divide-y rounded-lg border" data-testid="exams-list">
          {list.data.map((e) => (
            <li key={e.id}>
              <Link href={`${base}/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {e.name} <span className="font-normal text-muted-foreground">· {EXAM_KIND_LABEL[e.kind]}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {e.course_name} · {e.batches.map((b) => b.name).join(", ")} · {dates(e.starts_on, e.ends_on)} · {e.paper_count} {e.paper_count === 1 ? "paper" : "papers"}
                  </p>
                </div>
                <StatusBadge status={e.state} label={EXAM_STATE[e.state].label} tone={EXAM_STATE[e.state].tone} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
