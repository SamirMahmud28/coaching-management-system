import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InstituteChangePassword } from "@/modules/institute/components/sign-in-form";
import { getCurrentInstituteUser } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Change password", robots: { index: false, follow: false } };

export default async function InstituteChangePasswordPage() {
  const session = await getCurrentInstituteUser();
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
      <InstituteChangePassword />
    </div>
  );
}
