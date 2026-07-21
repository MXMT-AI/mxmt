const DEFAULT_TIMEOUT_MS = 30_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  if (init.signal) {
    return fetch(input, init);
  }

  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}
