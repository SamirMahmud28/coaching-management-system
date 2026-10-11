import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentInstitute } from "@/server/modules/institute/current-user";

export default async function InstituteAuthLayout({ children }: { children: React.ReactNode }) {
  const institute = await getCurrentInstitute();

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="h-1 bg-brand-gradient" aria-hidden />
      <header className="flex items-center justify-end p-4">
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <Logo size="md" variant="mark" />
            <p className="text-lg font-semibold">{institute.name}</p>
          </div>
          <Card>
            <CardContent className="pt-6">{children}</CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
