"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

function getExpCookie(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)access_token_exp=([^;]+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Proactively refreshes the access token 2 minutes before it expires.
// Reads the non-httpOnly access_token_exp cookie set by auth routes.
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
          schedule(); // schedule next refresh with the new token's expiry
          router.refresh(); // revalidate server components with new token
        } else {
          router.push("/login");
        }
      } catch {
        // network error — retry in 30s
        timerRef.current = setTimeout(doRefresh, 30_000);
      }
    }

    schedule();

    // Reschedule when tab becomes visible after being hidden
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
