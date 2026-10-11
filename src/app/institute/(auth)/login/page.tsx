import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InstituteSignInForm } from "@/modules/institute/components/sign-in-form";
import { getCurrentInstituteUser } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function InstituteLoginPage({ searchParams }: { searchParams: Promise<{ inactive?: string }> }) {
  const session = await getCurrentInstituteUser();
  const active = session && (session.tenant.status === "ACTIVE" || session.tenant.status === "SUSPENDED");
  if (active) redirect(session.mustChangePassword ? "/change-password" : "/app");

  const { inactive } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <InstituteSignInForm inactive={inactive === "1"} />
    </div>
  );
}
