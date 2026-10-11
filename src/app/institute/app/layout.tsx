import type { Metadata } from "next";
import { QueryProvider } from "@/components/providers/query-provider";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Each portal's own layout signs the user in and draws its shell; every API route enforces access itself.
export default function InstituteAppLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
