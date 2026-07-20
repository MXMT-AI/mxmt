import { redirect } from "next/navigation";
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

  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  if (!tenant) redirect("/login");

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <TokenRefreshProvider />
      <Sidebar tenantName={tenant.name} userRole={role ?? "viewer"} />
      <main id="main-content" className="flex-1 overflow-auto min-w-0" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
