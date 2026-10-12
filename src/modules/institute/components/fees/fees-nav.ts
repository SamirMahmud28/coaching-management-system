/** Which Fees sections a user can open, from their permissions (already limited to active modules). Server-safe. */
export interface FeesNav {
  canCollect: boolean;
  canGenerate: boolean;
  canReport: boolean;
}

export const feesNav = (permissions: ReadonlySet<string>): FeesNav => ({
  canCollect: permissions.has("fees.collect"),
  canGenerate: permissions.has("fees.generate"),
  canReport: permissions.has("fees.report.view"),
});
