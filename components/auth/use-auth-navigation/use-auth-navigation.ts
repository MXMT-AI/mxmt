"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { safeReturnPath } from "@/i18n/redirect";
import type { Locale } from "@/i18n/routing";

export function useAuthNavigation(locale: Locale) {
  const router = useRouter();
  const returnTo = useSearchParams().get("next");
  const authQuery = returnTo ? `?${new URLSearchParams({ next: returnTo })}` : "";

  function navigateAfterAuth() {
    const currentReturnTo = new URLSearchParams(window.location.search).get("next");
    const destination = safeReturnPath(currentReturnTo, locale);
    const path = destination.slice(locale.length + 1);
    router.push(path.startsWith("/") ? path : `/${path}`);
    router.refresh();
  }

  return { authQuery, navigateAfterAuth };
}
