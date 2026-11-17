import "server-only";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

export async function requireWorkspaceTenantId(): Promise<string> {
  const requestHeaders = await headers();
  const tenantId = requestHeaders.get("x-tenant-id");
  if (!tenantId) return redirect({ href: "/login", locale: await getLocale() });
  return tenantId;
}
