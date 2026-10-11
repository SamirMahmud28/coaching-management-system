import type { Metadata } from "next";
import { InstituteUsersPage } from "@/modules/institute/components/users-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Users" };

export default async function Page() {
  const { permissions } = await requireModulePage("users.view");
  return <InstituteUsersPage canManage={permissions.has("users.manage")} />;
}
