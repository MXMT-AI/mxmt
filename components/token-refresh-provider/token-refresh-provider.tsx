"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";


function getExpCookie(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)access_token_exp=([^;]+)/);
  return match ? parseInt(match[1], 10) : null;
}

export default function TokenRefreshProvider() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function schedule() {
      clearTimeout(timerRef.current);

      const exp = getExpCookie();
      if (!exp) return;

      const msUntilRefresh = exp * 1000 - Date.now() - 2 * 60 * 1000;

      if (msUntilRefresh <= 0) {
        doRefresh();
        return;
      }

      timerRef.current = setTimeout(doRefresh, msUntilRefresh);
    }

    async function doRefresh() {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (res.ok) {
          schedule();
          router.refresh();
        } else {
          const { pathname, search, hash } = window.location;
          router.push(`/login?${new URLSearchParams({ next: pathname + search + hash })}`);
        }
      } catch {
        timerRef.current = setTimeout(doRefresh, 30_000);
      }
    }

    schedule();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") schedule();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
