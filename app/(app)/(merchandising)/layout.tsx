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
  const options = await readNavigationOptions(user.tenantId).catch(() => null);
  return (
    <Suspense fallback={<MerchandisingLoading />}>
      <MerchandisingShell options={options} now={new Date().toISOString()}>
        {children}
      </MerchandisingShell>
    </Suspense>
  );
}
