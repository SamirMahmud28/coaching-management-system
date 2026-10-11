"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Building2, Inbox, ScrollText, ShieldCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { platformApi } from "../api";

// Host-relative paths: the proxy maps them onto /platform/* on the platform host.
const NAV: NavItem[] = [
  { href: "/institutes", label: "Institutes", icon: Building2 },
  { href: "/module-requests", label: "Module requests", icon: Inbox },
  { href: "/admins", label: "Platform admins", icon: Users },
  { href: "/audit-log", label: "Audit log", icon: ScrollText },
];

export interface CurrentPlatformAdmin {
  id: string;
  name: string;
  email: string;
}

interface PlatformContextValue {
  admin: CurrentPlatformAdmin;
  // e.g. "https://{subdomain}.<domain>", from server config.
  instituteUrlTemplate: string;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

function usePlatformContext(): PlatformContextValue {
  const value = useContext(PlatformContext);
  if (!value) throw new Error("Platform hooks must be used inside PlatformShell");
  return value;
}

export const useCurrentPlatformAdmin = () => usePlatformContext().admin;

export function useInstituteUrl(): (subdomain: string) => string {
  const { instituteUrlTemplate } = usePlatformContext();
  return (subdomain) => instituteUrlTemplate.replace("{subdomain}", subdomain);
}

export function PlatformShell({
  admin,
  instituteUrlTemplate,
  children,
}: {
  admin: CurrentPlatformAdmin;
  instituteUrlTemplate: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function signOut() {
    try {
      await platformApi.signOut();
    } finally {
      queryClient.clear();
      router.replace("/login");
    }
  }

  return (
    <PlatformContext.Provider value={{ admin, instituteUrlTemplate }}>
      <AppShell
        nav={NAV}
        appLabel="Platform"
        appBadge={
          <Badge variant="outline" className="gap-1">
            <ShieldCheck /> Platform Admin
          </Badge>
        }
        user={{ name: admin.name, email: admin.email }}
        onSignOut={signOut}
      >
        {children}
      </AppShell>
    </PlatformContext.Provider>
  );
}
