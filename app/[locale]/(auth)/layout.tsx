import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

// If already authenticated, skip the auth pages
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  if (cookieStore.has("access_token")) return redirect({href: "/dashboard", locale: await getLocale()});
  return <>{children}</>;
}
