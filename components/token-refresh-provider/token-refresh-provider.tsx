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
      if (document.visibilityState !== "visible") return;

      const exp = getExpCookie();
      const msUntilRefresh = (exp ?? 0) * 1000 - Date.now() - 2 * 60 * 1000;

      if (msUntilRefresh <= 0) {
        void doRefresh();
        return;
      }

      timer = setTimeout(doRefresh, msUntilRefresh);
    }

    async function doRefresh() {
      if (stopped || refreshing || document.visibilityState !== "visible") return;
      refreshing = true;
      try {
        const refreshed = await refreshAccessToken();
        if (stopped) return;
        if (refreshed) {
          refreshing = false;
          if ((getExpCookie() ?? 0) * 1000 > Date.now() + 2 * 60 * 1000) schedule();
          else timer = setTimeout(doRefresh, 30_000);
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

    document.addEventListener("visibilitychange", schedule);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [router]);

  return null;
}
