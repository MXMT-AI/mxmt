import { Suspense } from "react";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { requireCurrentUser } from "@/lib/server-auth";
import { hasRole } from "@/lib/roles";
import { readNavigationOptions } from "@/lib/merchandising-navigation-store";
import MerchandisingShell from "@/components/merchandising/merchandising-shell/merchandising-shell";
import MerchandisingLoading from "@/components/merchandising/merchandising-loading/merchandising-loading";

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
        exportAllowed={hasRole(user.role, "ANALYST")}
      >
        {children}
      </NavigationContent>
    </Suspense>
  );
}

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
