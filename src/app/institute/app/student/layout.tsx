import { InstituteShell } from "@/modules/institute/components/institute-shell";
import { requirePortal } from "@/server/modules/institute/current-user";
import { getShellBrand } from "@/server/modules/institute/shell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { session, permissions } = await requirePortal("student");
  const brand = await getShellBrand(session.tenant.id, session.tenant.name);
  return (
    <InstituteShell
      portal="student"
      instituteName={brand.name}
      logoUrl={brand.logoUrl}
      appTheme={brand.appTheme}
      paper={brand.paper}
      suspended={session.tenant.status === "SUSPENDED"}
      permissions={[...permissions]}
      user={{ name: session.name, email: session.email ?? session.username }}
    >
      {children}
    </InstituteShell>
  );
}
