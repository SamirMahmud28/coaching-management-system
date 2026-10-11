import { InstituteShell } from "@/modules/institute/components/institute-shell";
import { requirePortal } from "@/server/modules/institute/current-user";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { session, permissions } = await requirePortal("instructor");
  return (
    <InstituteShell
      portal="instructor"
      instituteName={session.tenant.name}
      suspended={session.tenant.status === "SUSPENDED"}
      permissions={[...permissions]}
      user={{ name: session.name, email: session.email ?? session.username }}
    >
      {children}
    </InstituteShell>
  );
}
