"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount } from "@/lib/format";
import { fromPoisha, sumPoisha, toPoisha } from "@/lib/money";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { chargesApi, studentsApi } from "../../api";
import { instituteKeys } from "../../keys";
import { CollectPanel } from "./collect-panel";
import type { FeesNav } from "./fees-nav";
import { FeesTabs } from "./fees-tabs";

interface Picked {
  id: string;
  name: string;
  code: string;
  status: string;
}

/**
 * The counter: find a student by name or ID (mobile too, with contact access), see what they owe and collect it — with any waivers and
 * fines — then print the receipt. The same collect panel as the student's fees page.
 */
export function CollectPage({ nav, canWaive, canFine }: { nav: FeesNav; canWaive: boolean; canFine: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [student, setStudent] = useState<Picked | null>(null);
  const q = search.trim();
  const found = useQuery({
    queryKey: instituteKeys.students({ q, status: "ALL", page_size: 8 }),
    queryFn: () => studentsApi.list({ q, status: "ALL", page_size: 8 }),
    enabled: q.length >= 2 && !student,
  });
  const charges = useQuery({
    queryKey: instituteKeys.studentCharges(student?.id ?? ""),
    queryFn: () => chargesApi.studentCharges(student!.id),
    enabled: !!student,
  });
  const due = charges.data?.filter((c) => c.state === "DUE") ?? [];
  const dueTotal = fromPoisha(sumPoisha(due.map((c) => toPoisha(c.net))));

  return (
    <>
      <PageHeader title="Fees" description="Find a student and collect what they owe." />
      <FeesTabs nav={nav} />
      <HowThisWorks topic="fees-counter" />

      {student ? (
        <div className="space-y-4">
          <div className="surface-glass-item flex flex-wrap items-center gap-3 rounded-lg border p-3" data-testid="collect-student">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {student.name} <span className="font-normal text-muted-foreground">· {student.code}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {charges.data ? `${due.length} due · ${formatAmount(dueTotal)}` : "Loading…"}
                {" · "}
                <Link href={`/app/fees/students/${student.id}`} className="underline">
                  Full fee record
                </Link>
              </p>
            </div>
            {student.status !== "ACTIVE" && <StatusBadge status={student.status} />}
            <Button
              variant="outline"
              onClick={() => {
                setStudent(null);
                setSearch("");
              }}
            >
              <X /> Another student
            </Button>
          </div>
          {charges.isPending ? (
            <LoadingState rows={3} />
          ) : charges.error ? (
            <ErrorState message={charges.error.message} onRetry={() => charges.refetch()} />
          ) : (
            <CollectPanel
              key={student.id}
              studentId={student.id}
              due={due}
              canWaive={canWaive}
              canFine={canFine}
              onRecorded={() =>
                Promise.all([
                  queryClient.invalidateQueries({ queryKey: instituteKeys.studentCharges(student.id) }),
                  queryClient.invalidateQueries({ queryKey: instituteKeys.studentPayments(student.id) }),
                  queryClient.invalidateQueries({ queryKey: ["institute-payments"] }),
                ])
              }
            />
          )}
        </div>
      ) : (
        <div className="max-w-xl space-y-2">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Find a student by name or student ID"
              placeholder="Name or student ID (or mobile, if you can see contacts)"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          {q.length < 2 ? (
            <p className="text-sm text-muted-foreground">Type at least 2 characters.</p>
          ) : found.isPending ? (
            <LoadingState rows={2} />
          ) : found.error ? (
            <ErrorState message={found.error.message} onRetry={() => found.refetch()} />
          ) : found.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No student found.</p>
          ) : (
            <ul className="surface-glass-dense divide-y rounded-lg border" data-testid="collect-results">
              {found.data.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => setStudent({ id: s.id, name: s.full_name, code: s.student_code, status: s.status })}
                  >
                    <span className="flex-1">
                      <span className="font-medium">{s.full_name}</span> <span className="text-muted-foreground">· {s.student_code}</span>
                      {s.batches.length > 0 && <span className="text-muted-foreground"> · {s.batches.map((b) => b.name).join(", ")}</span>}
                    </span>
                    {s.status !== "ACTIVE" && <StatusBadge status={s.status} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
