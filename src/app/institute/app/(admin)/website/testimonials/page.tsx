import type { Metadata } from "next";
import { WebsiteTestimonialsPage } from "@/modules/institute/components/website/testimonials-page";
import { requireModulePage } from "@/server/modules/institute/current-user";

export const metadata: Metadata = { title: "Website testimonials" };

// 404 when the Website module is off or without website.manage.
export default async function Page() {
  await requireModulePage("website.manage");
  return <WebsiteTestimonialsPage />;
}
