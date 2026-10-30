import { Suspense } from "react";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { requireCurrentUser } from "@/lib/server-auth";
import { readNavigationOptions } from "@/lib/merchandising-navigation-store";
import MerchandisingShell from "@/components/merchandising/MerchandisingShell";
import MerchandisingLoading from "@/components/merchandising/MerchandisingLoading";
export const dynamic = "force-dynamic";

export default async function MerchandisingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser("VIEWER").catch(() => null);
  if (!user) return redirect({href: "/login", locale: await getLocale()});
  return (
    <Suspense fallback={<MerchandisingLoading />}>
      <NavigationContent
        tenantId={user.tenantId}
        exportAllowed={["ANALYST", "ADMIN", "SUPER_ADMIN"].includes(user.role)}
      >
        {children}
      </NavigationContent>
    </Suspense>
  );
}

/** Stream the loading state while tenant-scoped settings and channel choices resolve. */
async function NavigationContent({
  tenantId,
  children,
  exportAllowed,
}: {
  tenantId: string;
  exportAllowed: boolean;
  children: React.ReactNode;
}) {
  const options = await readNavigationOptions(tenantId).catch(() => null);
  return (
    <MerchandisingShell
      options={options}
      now={new Date().toISOString()}
      exportAllowed={exportAllowed}
    >
      {children}
    </MerchandisingShell>
  );
}
