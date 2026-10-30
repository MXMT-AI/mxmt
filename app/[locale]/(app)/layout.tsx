import AppSkipLink from "@/components/AppSkipLink";
import { Suspense } from "react";
import { navigationFeatures } from "@/lib/navigation-features";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/Sidebar";
import TokenRefreshProvider from "@/components/TokenRefreshProvider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  const role = h.get("x-user-role");

  if (!tenantId) return redirect({href: "/login", locale: await getLocale()});

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  if (!tenant) return redirect({href: "/login", locale: await getLocale()});

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-(--bg)">
      <AppSkipLink />
      <TokenRefreshProvider />
      <Suspense fallback={<div className="md:w-56" />}>
        <Sidebar
          tenantName={tenant.name}
          userRole={role ?? "viewer"}
          features={navigationFeatures()}
        />
      </Suspense>
      <main
        id="main-content"
        className="flex-1 overflow-auto min-w-0"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
