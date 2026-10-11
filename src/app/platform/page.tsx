import type { Metadata } from "next";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Platform", robots: { index: false, follow: false } };

// Placeholder for the Super Admin app, built in M2.
export default function PlatformHomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-3 px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">{BRAND.name} · Platform</h1>
    </main>
  );
}
