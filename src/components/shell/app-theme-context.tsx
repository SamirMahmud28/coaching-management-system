"use client";

import { createContext, useContext } from "react";
import type { AppTheme } from "@/lib/app-themes";

export interface AppThemeControl {
  /** The theme saved for this app (the institute's, or the platform admin's own). */
  saved: AppTheme;
  /** What is on screen: a preview while one is being chosen, else the saved theme. */
  shown: AppTheme;
  /** Shows a theme across the app without saving it; `null` goes back to the saved one. */
  preview: (theme: AppTheme | null) => void;
  /** Whether the paper background is on screen now. */
  paper: boolean;
  /** Shows the paper background on or off without saving; `null` goes back to the saved setting. */
  previewPaper: (on: boolean | null) => void;
  /** Records a newly saved theme (and, when given, whether the paper shows) so the app keeps showing it. */
  commit: (theme: AppTheme, paper?: boolean) => void;
}

export const AppThemeContext = createContext<AppThemeControl | null>(null);

/** The shell's theme control; null outside an app shell (e.g. in isolated component tests). */
export function useAppThemeControl(): AppThemeControl | null {
  return useContext(AppThemeContext);
}
