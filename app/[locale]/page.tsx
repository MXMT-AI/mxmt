import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

// Root redirect — middleware handles auth check before this renders
export default async function Home() {
  redirect({href: "/dashboard", locale: await getLocale()});
}
