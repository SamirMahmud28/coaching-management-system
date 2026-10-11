import { ForbiddenError, UnauthorizedError } from "../../core/errors";
import type { PlatformAuth } from "../auth/platform-auth";
import { getPlatformSession, type PlatformSession } from "../auth/platform-session";

const READ_METHODS = new Set(["GET", "HEAD"]);

/**
 * Identity-only authorization for /api/platform/*. Cross-origin writes are refused on top of the
 * SameSite cookie, and an admin on a temporary password can't do anything else.
 */
export async function requirePlatformAdmin(auth: PlatformAuth, request: Request, expectedOrigin: string): Promise<PlatformSession> {
  if (!READ_METHODS.has(request.method.toUpperCase())) {
    const origin = request.headers.get("origin");
    if (origin && origin !== expectedOrigin) throw new ForbiddenError("INVALID_ORIGIN", "Invalid origin");
  }
  const session = await getPlatformSession(auth, request.headers);
  if (!session) throw new UnauthorizedError();
  if (session.mustChangePassword) {
    throw new ForbiddenError("AUTH_PASSWORD_CHANGE_REQUIRED", "Change your temporary password before continuing.");
  }
  return session;
}
