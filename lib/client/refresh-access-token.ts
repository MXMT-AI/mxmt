let pending: Promise<boolean> | undefined;

export function refreshAccessToken(): Promise<boolean> {
  if (!pending) {
    pending = fetch("/api/auth/refresh", { method: "POST" })
      .then(response => {
        if (response.ok) return true;
        if (response.status === 401) return false;
        throw new Error(`Session renewal failed (${response.status})`);
      })
      .finally(() => { pending = undefined; });
  }
  return pending;
}
