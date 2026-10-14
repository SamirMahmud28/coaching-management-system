"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, kept in sync as the window changes. On the server and in the first client render
 * it reports `serverValue` (default false), so the markup matches the server's and the switch happens after hydration.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}

/** Phones and small tablets: below Tailwind's `md` breakpoint (768 px). */
export const PHONE_QUERY = "(max-width: 767.98px)";
