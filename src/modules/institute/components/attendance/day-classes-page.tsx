"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { HowThisWorks } from "@/modules/institute/help/how-this-works";
import { attendanceApi, type DayClassRow } from "../../api";
import { instituteKeys } from "../../keys";

export const CLASS_STATE: Record<DayClassRow["state"], { label: string; tone: "info" | "success" | "secondary" | "warning" }> = {
  NOT_TAKEN: { label: "Not taken", tone: "warning" },
  OPEN: { label: "Not taken", tone: "warning" },
  TAKEN: { label: "Taken", tone: "success" },
  NOT_HELD: { label: "No class held", tone: "secondary" },
};

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const registerHref = (base: string, c: { batch_subject_id: string; starts_at: string }, date: string) =>
  `${base}/register?bs=${c.batch_subject_id}&date=${date}&at=${c.starts_at}`;

/**
 * A day's classes with the state of each register (D80, D81): everyone at the office sees every class, an instructor
 * only their own. Used by the admin panel and the instructor portal (`base` is where its register page lives).
 */
export function DayClassesPage({ base, date, canTake, fullGuide = true }: { base: string; date?: string; canTake: boolean; fullGuide?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const day = useQuery({ queryKey: instituteKeys.attendanceDay(date), queryFn: () => attendanceApi.classes(date) });
  const [adding, setAdding] = useState(false);
  const [extra, setExtra] = useState({ subject: "", date: "", start: "", end: "" });

  const go = (d: string) => router.replace(`${base}?date=${d}`, { scroll: false });

  if (day.isPending) return <LoadingState rows={4} />;
  if (day.error) return <ErrorState message={day.error.message} onRetry={() => day.refetch()} />;
  const { classes, subjects, today } = day.data;
  const shown = day.data.date;
  const isToday = shown === today;

  return (
    <>
      <PageHeader
        title="Attendance"
        description={isToday ? `Today's classes · ${formatDate(shown)}` : `Classes on ${formatDate(shown)}`}
        actions={
          canTake && subjects.length > 0 ? (
            <Button
              variant="outline"
              onClick={() => {
                setExtra({ subject: subjects.length === 1 ? subjects[0].id : "", date: shown > today ? today : shown, start: "", end: "" });
                setAdding(true);
              }}
            >
              <Plus /> Extra class
            </Button>
          ) : null
        }
      />
      <HowThisWorks topic="attendance-registers" fullGuide={fullGuide} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => go(shift(shown, -1))}>
          <ChevronLeft />
        </Button>
        <Input type="date" aria-label="Date" className="w-auto" value={shown} onChange={(e) => e.target.value && go(e.target.value)} />
        <Button variant="outline" size="icon" aria-label="Next day" onClick={() => go(shift(shown, 1))}>
          <ChevronRight />
        </Button>
        {!isToday && (
          <Button variant="ghost" onClick={() => go(today)}>
            Today
          </Button>
        )}
      </div>

      {classes.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No classes on this day"
          description={subjects.length ? "Nothing is on the weekly schedule for this day. Add an extra class if one is held." : "You have no batch subjects to take attendance for."}
        />
      ) : (
        <ul className="divide-y rounded-lg border" data-testid="day-classes">
          {classes.map((c) => {
            const state = CLASS_STATE[c.state];
            return (
              <li key={`${c.batch_subject_id}-${c.starts_at}`}>
                <Link href={registerHref(base, c, shown)} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                  <div className="w-24 shrink-0 text-sm tabular-nums">
                    {c.starts_at}–{c.ends_at}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {c.subject_name} <span className="font-normal text-muted-foreground">· {c.batch_name}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {c.course_name}
                      {c.source === "EXTRA" && " · Extra class"}
                      {c.counts && ` · ${c.counts.present + c.counts.late} present, ${c.counts.absent} absent`}
                      {c.not_held_reason && ` · ${c.not_held_reason}`}
                    </p>
                  </div>
                  <StatusBadge status={c.state} label={state.label} tone={state.tone} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add an extra class"
        description="For a make-up or extra class that isn't on the weekly schedule. It appears in that day's classes, and its register is taken like any other."
        confirmLabel="Add class"
        confirmDisabled={!extra.subject || !extra.date || !extra.start || !extra.end}
        onConfirm={async () => {
          await attendanceApi.addExtra(extra.subject, { date: extra.date, starts_at: extra.start, ends_at: extra.end });
          await queryClient.invalidateQueries({ queryKey: ["institute-attendance-day"] });
          if (extra.date !== shown) go(extra.date);
        }}
      >
        <div className="space-y-3">
          <FormField id="extra-subject" required label="Batch and subject">
            <Select value={extra.subject} onValueChange={(v) => setExtra({ ...extra, subject: v })}>
              <SelectTrigger id="extra-subject" className="w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.batch_name} · {s.subject_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="extra-date" required label="Date" hint="Today or another day; a past day's register can only be taken by an Admin.">
            <Input id="extra-date" type="date" value={extra.date} onChange={(e) => setExtra({ ...extra, date: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="extra-start" required label="Starts">
              <Input id="extra-start" type="time" value={extra.start} onChange={(e) => setExtra({ ...extra, start: e.target.value })} />
            </FormField>
            <FormField id="extra-end" required label="Ends">
              <Input id="extra-end" type="time" value={extra.end} onChange={(e) => setExtra({ ...extra, end: e.target.value })} />
            </FormField>
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
