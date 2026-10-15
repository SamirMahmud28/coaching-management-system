import { BRAND } from "@/config/brand";

// Placeholder until host routing sends each host to its own area: product site, Super Admin, or institute.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-3 px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">{BRAND.name}</h1>
      <p className="text-muted-foreground">{BRAND.tagline}</p>
    </main>
  );
}
