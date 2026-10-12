"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { DeleteBlockedDialog } from "@/components/shared/delete-blocked-dialog";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApiError } from "@/lib/api-client";
import { runAction } from "@/lib/feedback";
import { formatAmount } from "@/lib/format";
import { academicApi, feesApi, type FeeItemKind, type FeeItemRow } from "../../api";
import { instituteKeys } from "../../keys";
import { FeesTabs } from "./fees-tabs";

export const KIND_LABEL: Record<FeeItemKind, string> = { ADMISSION: "Admission (one-time)", MONTHLY: "Monthly", ONE_TIME: "Other one-time" };
const dueDayText = (day: number | null) => (day === null ? "due day not set" : day === 31 ? "due on the last day" : `due on day ${day}`);

/** Fee items per course (D28) and the receipt prefix (D38). */
export function FeeItemsPage({ canConfigure, canGenerate, canReport }: { canConfigure: boolean; canGenerate: boolean; canReport: boolean }) {
  const queryClient = useQueryClient();
  const items = useQuery({ queryKey: instituteKeys.feeItems(), queryFn: () => feesApi.items() });
  const courses = useQuery({ queryKey: instituteKeys.courses({ status: "ACTIVE" }), queryFn: () => academicApi.courses({ status: "ACTIVE" }) });
  const [editing, setEditing] = useState<{ courseId: string; item?: FeeItemRow } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["institute-fee-items"] });

  if (items.isPending || courses.isPending) return <LoadingState rows={5} />;
  if (items.error) return <ErrorState message={items.error.message} onRetry={() => items.refetch()} />;
  const byCourse = new Map<string, { name: string; code: string; dueDay: number | null; items: FeeItemRow[] }>();
  for (const c of courses.data ?? []) byCourse.set(c.id, { name: c.name, code: c.code, dueDay: c.due_day, items: [] });
  for (const i of items.data) {
    if (!byCourse.has(i.course_id)) byCourse.set(i.course_id, { name: i.course_name, code: i.course_code, dueDay: i.course_due_day, items: [] });
    byCourse.get(i.course_id)!.items.push(i);
  }

  return (
    <>
      <PageHeader title="Fees" description="Each course's fees. Monthly and one-time charges are generated from these amounts; a student can have their own amount on their profile." />
      <FeesTabs canGenerate={canGenerate} canReport={canReport} />
      {byCourse.size === 0 ? (
        <EmptyState icon={Wallet} title="No courses yet" description="Add courses under Courses & batches first." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...byCourse.entries()].map(([courseId, c]) => (
            <Card key={courseId} data-testid="course-fees">
              <CardHeader>
                <CardTitle>
                  {c.name} <span className="font-mono text-sm font-normal text-muted-foreground">{c.code}</span>
                </CardTitle>
                <CardDescription>Monthly fees {dueDayText(c.dueDay)} (set on the course).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No fees yet.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {c.items.map((i) => (
                      <FeeItemRowView key={i.id} item={i} canConfigure={canConfigure} onEdit={() => setEditing({ courseId, item: i })} onChanged={refresh} />
                    ))}
                  </ul>
                )}
                {canConfigure && (
                  <Button size="sm" variant="outline" onClick={() => setEditing({ courseId })}>
                    <Plus /> Add fee
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ReceiptPrefixCard canConfigure={canConfigure} />
      <FeeItemDialog
        key={editing ? (editing.item?.id ?? `new-${editing.courseId}`) : "closed"}
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          await refresh();
          setEditing(null);
        }}
      />
    </>
  );
}

function FeeItemRowView({ item, canConfigure, onEdit, onChanged }: { item: FeeItemRow; canConfigure: boolean; onEdit: () => void; onChanged: () => Promise<unknown> }) {
  const [blocked, setBlocked] = useState<ApiError | null>(null);
  const active = item.status === "ACTIVE";
  const setStatus = (status: "ACTIVE" | "ARCHIVED") =>
    runAction(async () => {
      await feesApi.setItemStatus(item.id, status);
      await onChanged();
    });
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">{KIND_LABEL[item.kind]}</p>
      </div>
      <span className="font-mono">{formatAmount(item.amount)}</span>
      {!active && <StatusBadge status={item.status} />}
      {canConfigure && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" aria-label={`${item.name} actions`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            {active ? (
              <DropdownMenuItem onSelect={() => setStatus("ARCHIVED")}>
                <Archive /> Archive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setStatus("ACTIVE")}>
                <ArchiveRestore /> Restore
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                runAction(
                  async () => {
                    await feesApi.deleteItem(item.id);
                    await onChanged();
                  },
                  { success: `${item.name} deleted.`, onBlocked: setBlocked },
                )
              }
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DeleteBlockedDialog error={blocked} itemName={item.name} onClose={() => setBlocked(null)} onInstead={active ? () => setStatus("ARCHIVED") : undefined} insteadLabel="Archive instead" />
    </li>
  );
}

function FeeItemDialog({ target, onClose, onSaved }: { target: { courseId: string; item?: FeeItemRow } | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const editing = !!target?.item;
  // Remounted per target (see its key), so the fields start from the item being edited.
  const [kind, setKind] = useState<FeeItemKind>(target?.item?.kind ?? "MONTHLY");
  const [name, setName] = useState(target?.item?.name ?? "");
  const [amount, setAmount] = useState(target?.item ? target.item.amount.replace(/\.00$/, "") : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!target) return;
    setSaving(true);
    await runAction(async () => {
      if (target.item) await feesApi.updateItem(target.item.id, { name: name.trim(), amount: amount.trim() });
      else await feesApi.createItem({ course_id: target.courseId, kind, name: name.trim(), amount: amount.trim() });
      await onSaved();
    });
    setSaving(false);
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (open) return;
        onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit fee" : "Add fee"}</DialogTitle>
          <DialogDescription>{editing ? "A new amount applies to charges generated from now on; existing charges keep theirs." : "Monthly fees are charged per month; admission and other one-time fees once per student."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!editing && (
            <FormField id="fee-kind" required label="Kind">
              <Select value={kind} onValueChange={(v) => setKind(v as FeeItemKind)}>
                <SelectTrigger id="fee-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as FeeItemKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <FormField id="fee-name" required label="Name">
            <Input id="fee-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuition" />
          </FormField>
          <FormField id="fee-amount" required label="Amount (৳)">
            <Input id="fee-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2000" />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name.trim() || !amount.trim()}>
            {editing ? "Save" : "Add fee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptPrefixCard({ canConfigure }: { canConfigure: boolean }) {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: instituteKeys.feeSettings(), queryFn: feesApi.settings });
  const [prefix, setPrefix] = useState<string | null>(null);
  const value = prefix ?? settings.data?.receipt_prefix ?? "";
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Receipts</CardTitle>
        <CardDescription>
          Receipt numbers are this prefix and a running number, e.g. <span className="font-mono">{(value || "R").toUpperCase()}-000123</span>. Numbers never restart; issued receipts keep the prefix they were printed with.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-2">
        <FormField id="receipt-prefix" label="Receipt prefix">
          <Input id="receipt-prefix" className="w-32 font-mono uppercase" maxLength={10} disabled={!canConfigure} value={value} onChange={(e) => setPrefix(e.target.value.toUpperCase())} />
        </FormField>
        {canConfigure && (
          <Button
            variant="outline"
            disabled={prefix === null || prefix === settings.data?.receipt_prefix}
            onClick={() =>
              runAction(
                async () => {
                  await feesApi.saveSettings(value);
                  setPrefix(null);
                  await queryClient.invalidateQueries({ queryKey: instituteKeys.feeSettings() });
                },
                { success: "Receipt prefix saved." },
              )
            }
          >
            Save
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
