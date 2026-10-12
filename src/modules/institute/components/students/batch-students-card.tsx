"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { studentsApi } from "../../api";
import { instituteKeys } from "../../keys";

/** A batch's current students, by roll number. Students are added to batches from their profile or at admission. */
export function BatchStudentsCard({ batchId }: { batchId: string }) {
  const query = useQuery({ queryKey: instituteKeys.batchStudents(batchId), queryFn: () => studentsApi.batchStudents(batchId) });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Students{query.data ? ` (${query.data.length})` : ""}</CardTitle>
        <CardDescription>Current members. Add a student to a batch from their profile.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <LoadingState rows={3} />
        ) : query.error ? (
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        ) : query.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students in this batch yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {query.data.map((s) => (
              <li key={s.membership_id}>
                <Link href={`/app/students/${s.id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                  <span className="w-10 font-mono text-muted-foreground">{s.roll_number ?? "—"}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{s.full_name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{s.student_code}</span>
                  {s.status !== "ACTIVE" && <StatusBadge status={s.status} />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
