import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlatformLoginForm } from "@/modules/platform/components/login-form";
import { getCurrentPlatformAdmin } from "@/server/modules/platform/current-admin";

export const metadata: Metadata = { title: "Sign in" };

export default async function PlatformLoginPage() {
  const session = await getCurrentPlatformAdmin();
  if (session) redirect(session.mustChangePassword ? "/change-password" : "/institutes");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">For platform staff only. Institutes sign in at their own address.</p>
      </div>
      <PlatformLoginForm />
    </div>
  );
}
