import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { fetchImportIssues } from "@/lib/client/import-issues-request";

vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it("preserves SalesDrive scope and page size while encoding the filter and forwarding cancellation", async () => {
  const data = { rows: [], pagination: { totalRows: 0, totalPages: 0 } };
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify(data)));
  const signal = new AbortController().signal;
  await expect(fetchImportIssues(2, "A&B", signal)).resolves.toEqual(data);
  expect(apiFetch).toHaveBeenCalledWith("/api/data/issues?source=salesdrive&pageSize=25&page=2&code=A%26B", { signal, cache: "no-store" });
});
it.each([
  [403, '{"rows":[]}'],
  [200, '{"rows":{}}'],
  [200, '<html>Unavailable</html>'],
] as const)("rejects unusable responses (%s, %s)", async (status, body) => {
  vi.mocked(apiFetch).mockResolvedValue(new Response(body, { status }));
  await expect(fetchImportIssues(1, "", new AbortController().signal)).rejects.toThrow("IMPORT_ISSUES_UNAVAILABLE");
});
