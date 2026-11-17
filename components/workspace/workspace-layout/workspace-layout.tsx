import { mainContentId, SkipLink } from "@/components/ui/skip-link/skip-link";
import { Suspense } from "react";
import { navigationFeatures } from "@/lib/navigation-features";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/sidebar/sidebar";
import TokenRefreshProvider from "@/components/token-refresh-provider/token-refresh-provider";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  const role = h.get("x-user-role");

  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      })
    : null;

  if (!tenant) return redirect({ href: "/login", locale: await getLocale() });

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-(--bg)">
      <SkipLink />
      <TokenRefreshProvider />
      <Suspense fallback={<div className="md:w-56" />}>
        <Sidebar
          tenantName={tenant.name}
          userRole={role ?? "viewer"}
          features={navigationFeatures()}
        />
      </Suspense>
      <main
        id={mainContentId}
        className="flex-1 overflow-auto min-w-0"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
