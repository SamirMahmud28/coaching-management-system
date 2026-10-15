import "server-only";
import { db } from "../../core/db/client";
import { resolvePaper, type AppTheme } from "@/lib/app-themes";
import { getAppearance, getInstitutionProfile } from "../settings/service";

/**
 * The institute's name, logo, app theme and paper background for the app shell. The logo is served by the public logo endpoint, which answers
 * for active and suspended institutes: the only ones whose users can be signed in.
 */
export async function getShellBrand(
  tenantId: string,
  fallbackName: string,
): Promise<{ name: string; logoUrl: string | null; appTheme: AppTheme; paper: boolean }> {
  const [profile, appearance] = await Promise.all([getInstitutionProfile(db, tenantId), getAppearance(db, tenantId)]);
  return {
    name: profile.displayName || fallbackName,
    logoUrl: profile.logoFileId ? "/api/public/logo" : null,
    appTheme: appearance.appTheme,
    paper: resolvePaper(appearance.appTheme, appearance.paperBackground),
  };
}
