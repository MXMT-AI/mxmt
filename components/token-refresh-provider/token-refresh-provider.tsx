"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { refreshAccessToken } from "@/lib/client/refresh-access-token";


function getExpCookie(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)access_token_exp=([^;]+)/);
  if (!match || !/^\d+$/.test(match[1])) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export default function TokenRefreshProvider() {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let refreshing = false;
    function schedule() {
      if (stopped || refreshing) return;
      clearTimeout(timer);

      const exp = getExpCookie();
      if (!exp) return;

      const msUntilRefresh = exp * 1000 - Date.now() - 2 * 60 * 1000;

      if (msUntilRefresh <= 0) {
        void doRefresh();
        return;
      }

      timer = setTimeout(doRefresh, msUntilRefresh);
    }

    async function doRefresh() {
      if (stopped || refreshing) return;
      refreshing = true;
      try {
        const refreshed = await refreshAccessToken();
        if (stopped) return;
        if (refreshed) {
          refreshing = false;
          schedule();
          router.refresh();
        } else {
          const { pathname, search, hash } = window.location;
          router.push(`/login?${new URLSearchParams({ next: pathname + search + hash })}`);
        }
      } catch {
        if (!stopped) timer = setTimeout(doRefresh, 30_000);
      } finally {
        refreshing = false;
      }
    }

    schedule();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") schedule();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
