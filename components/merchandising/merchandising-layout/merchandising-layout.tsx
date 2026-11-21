import { Suspense } from "react";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { requireCurrentUser } from "@/lib/server-auth";
import { hasRole } from "@/lib/roles";
import { readNavigationOptions } from "@/lib/merchandising-navigation-store";
import { configuredReportStorage } from "@/lib/merchandising-publication-storage";
import { readReportPublication } from "@/lib/merchandising-publication";
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
        publishAllowed={hasRole(user.role, "ADMIN")}
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
  publishAllowed,
}: {
  tenantId: string;
  exportAllowed: boolean;
  publishAllowed: boolean;
  children: React.ReactNode;
}) {
  const storage = configuredReportStorage(tenantId);
  const publication = storage
    ? await readReportPublication(tenantId, storage).catch(() => null)
    : null;
  const options = publication?.navigation ?? await readNavigationOptions(tenantId).catch(() => null);
  return (
    <MerchandisingShell
      options={options}
      now={new Date().toISOString()}
      exportAllowed={exportAllowed}
      publication={publication}
      publishAllowed={Boolean(storage) && publishAllowed}
    >
      {children}
    </MerchandisingShell>
  );
}
