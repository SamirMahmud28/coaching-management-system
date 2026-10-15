import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegisterPage } from "@/modules/institute/components/attendance/register-page";
import { classParams } from "@/modules/institute/components/attendance/class-params";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Register" };

// One class's register; the server decides who may see or change it.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireModulePage("attendance.view");
  const at = classParams(await searchParams);
  if (!at) notFound();
  return <RegisterPage base="/app/attendance" {...at} />;
}
