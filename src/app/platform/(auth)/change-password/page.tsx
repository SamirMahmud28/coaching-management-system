import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlatformChangePassword } from "@/modules/platform/components/login-form";
import { getCurrentPlatformAdmin } from "@/server/modules/platform/current-admin";

export const metadata: Metadata = { title: "Change password" };

export default async function PlatformChangePasswordPage() {
  const session = await getCurrentPlatformAdmin();
  if (!session) redirect("/login");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Choose your password</h1>
        <p className="text-sm text-muted-foreground">
          {session.mustChangePassword
            ? "You signed in with a temporary password. Choose your own before continuing."
            : "Change the password you use to sign in."}
        </p>
      </div>
      <PlatformChangePassword />
    </div>
  );
}
