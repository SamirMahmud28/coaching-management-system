"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendanceHistory } from "../../api";
import { AttendanceSummary } from "../attendance/student-attendance-card";

/** The student's own attendance: percentage overall and per subject, and each class. */
export function MyAttendanceCard({ data }: { data: AttendanceHistory }) {
  return (
    <Card data-testid="my-attendance">
      <CardHeader>
        <CardTitle>My attendance</CardTitle>
        <CardDescription>
          Percentage = (Present + Late) ÷ (Present + Late + Absent). Classes you were excused from (approved leave) and classes not held don&apos;t count either way.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AttendanceSummary data={data} emptyText="No registers have been taken for your classes yet." />
      </CardContent>
    </Card>
  );
}
