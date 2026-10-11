import type { PlatformAuth } from "./platform-auth";

export interface PlatformSession {
  platformUserId: string;
  sessionId: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
}

/** The signed-in Platform Admin, or null if the session is invalid or the admin is disabled. */
export async function getPlatformSession(auth: PlatformAuth, headers: Headers): Promise<PlatformSession | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;
  if (result.user.status === "DISABLED") return null;

  return {
    platformUserId: result.user.id,
    sessionId: result.session.id,
    name: result.user.name,
    email: result.user.email,
    mustChangePassword: result.user.mustChangePassword ?? false,
  };
}
