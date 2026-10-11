import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { platformAuth } from "../auth/instance";
import { getPlatformSession, type PlatformSession } from "../auth/platform-session";

// Redirect targets are host-relative: the proxy maps "/x" to "/platform/x" on the platform host.
export async function getCurrentPlatformAdmin(): Promise<PlatformSession | null> {
  return getPlatformSession(platformAuth, await headers());
}

export async function requireCurrentPlatformAdmin(): Promise<PlatformSession> {
  const session = await getCurrentPlatformAdmin();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  return session;
}
