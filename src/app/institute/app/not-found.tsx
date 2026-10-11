import Link from "next/link";

// Inside the app: a page that doesn't exist, a switched-off module, or one the user may not open all look the same.
export default function AppNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-3 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">It may have moved, or you may not have access to it.</p>
      <Link href="/app" className="text-primary-strong underline-offset-4 hover:underline">
        Back to the dashboard
      </Link>
    </main>
  );
}
