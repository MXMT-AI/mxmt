import { Suspense } from "react";
import { redirect } from "next/navigation";
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
  if (!user) redirect("/login");
  return (
    <Suspense fallback={<MerchandisingLoading />}>
      <NavigationContent tenantId={user.tenantId}>
        {children}
      </NavigationContent>
    </Suspense>
  );
}

/** Stream the loading state while tenant-scoped settings and channel choices resolve. */
async function NavigationContent({
  tenantId,
  children,
}: {
  tenantId: string;
  children: React.ReactNode;
}) {
  const options = await readNavigationOptions(tenantId).catch(() => null);
  return (
    <MerchandisingShell options={options} now={new Date().toISOString()}>
      {children}
    </MerchandisingShell>
  );
}
