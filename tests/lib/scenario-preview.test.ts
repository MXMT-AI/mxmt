import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/fetch", () => ({ apiFetch: m.fetch }));
import {
  postScenario,
  scenarioFailure,
} from "@/components/merchandising/useScenarioPreview";
beforeEach(() => vi.resetAllMocks());
describe("shared scenario transport errors", () => {
  it("uses the authenticated wrapper and passes the cancellation signal and server-only intent", async () => {
    const signal = new AbortController().signal;
    m.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ previewId: "preview", snapshotId: "frozen" }),
      ),
    );
    expect(
      await postScenario(
        "/api/merchandising/reordering/preview",
        { snapshotId: "frozen" },
        signal,
      ),
    ).toEqual({ previewId: "preview", snapshotId: "frozen" });
    expect(m.fetch).toHaveBeenCalledWith(
      "/api/merchandising/reordering/preview",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        signal,
        body: '{"snapshotId":"frozen"}',
      }),
    );
  });
  it("keeps typed field errors but drops malformed details and raw transport exceptions", async () => {
    m.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "INVALID_REORDERING_REQUEST",
          details: ["parameters.leadDays: invalid integer"],
        }),
        { status: 400 },
      ),
    );
    await expect(
      postScenario("/preview", {}, new AbortController().signal),
    ).rejects.toEqual({
      code: "INVALID_REORDERING_REQUEST",
      details: ["parameters.leadDays: invalid integer"],
    });
    expect(scenarioFailure(new Error("database password=secret"))).toEqual({
      code: "SCREEN_DATA_UNAVAILABLE",
      details: [],
    });
    expect(scenarioFailure({ code: 18, details: "bad" })).toEqual({
      code: "SCREEN_DATA_UNAVAILABLE",
      details: [],
    });
    expect(
      scenarioFailure({
        code: "INVALID_REORDERING_REQUEST",
        details: [null, "field", 3],
      }),
    ).toEqual({ code: "INVALID_REORDERING_REQUEST", details: ["field"] });
  });
  it("handles non-JSON upstream errors through a recoverable generic state", async () => {
    m.fetch.mockResolvedValue(
      new Response("<html>upstream unavailable</html>", { status: 503 }),
    );
    await expect(
      postScenario("/preview", {}, new AbortController().signal),
    ).rejects.toMatchObject({ code: "SCREEN_DATA_UNAVAILABLE", details: [] });
  });
});
