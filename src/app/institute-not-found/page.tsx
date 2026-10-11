import type { Metadata } from "next";

export const metadata: Metadata = { title: "Institute not found", robots: { index: false, follow: false } };

// Every unknown host looks the same, so the page never confirms whether an institute exists.
export default function InstituteNotFoundPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-3 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Institute not found</h1>
      <p className="text-muted-foreground">Check the address and try again.</p>
    </main>
  );
}
