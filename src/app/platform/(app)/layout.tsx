import { getEnv } from "@/server/core/config/env";
import { PlatformShell } from "@/modules/platform/components/platform-shell";
import { requireCurrentPlatformAdmin } from "@/server/modules/platform/current-admin";

// Navigation only; each /api/platform route enforces access itself.
export default async function PlatformAppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireCurrentPlatformAdmin();
  const env = getEnv();
  const protocol = env.NODE_ENV === "production" ? "https" : "http";

  return (
    <PlatformShell
      admin={{ id: admin.platformUserId, name: admin.name, email: admin.email }}
      instituteUrlTemplate={`${protocol}://{subdomain}.${env.APP_BASE_DOMAIN}`}
    >
      {children}
    </PlatformShell>
  );
}
