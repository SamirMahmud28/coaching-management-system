import type { Metadata } from "next";
import { getCurrentInstitute } from "@/server/modules/institute/current-user";

export async function generateMetadata(): Promise<Metadata> {
  const institute = await getCurrentInstitute();
  return { title: institute.name };
}

// Placeholder for the institute's basic public page (Core, D21), built in M7.
export default async function InstitutePublicPage() {
  const institute = await getCurrentInstitute();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-3 px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">{institute.name}</h1>
      <a href="/login" className="text-primary-strong underline-offset-4 hover:underline">
        Sign in
      </a>
    </main>
  );
}
