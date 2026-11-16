let pending: Promise<boolean> | undefined;

export function refreshAccessToken(): Promise<boolean> {
  if (!pending) {
    pending = fetch("/api/auth/refresh", { method: "POST" })
      .then(response => response.ok)
      .finally(() => { pending = undefined; });
  }
  return pending;
}
