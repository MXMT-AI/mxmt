import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import {
  continuation,
  pageRequest,
  advancePage,
} from "@/lib/connectors/continuation";
const context = {
  sourceId: "a",
  revision: 1,
  query: { from: "2026-01-01", limit: 2 },
};
const page = {
  observedAt: "2026-10-27T00:00:00Z",
  records: [1, 2],
  nextPage: null,
};
it("resumes old numeric checkpoints while detecting backwards or oversized pages", () => {
  const state = continuation(undefined, context, "page", 4);
  expect(pageRequest(state)).toEqual({ page: 4 });
  expect(state.seen).toEqual([]);
  expect(advancePage(state, { ...page, nextPage: 5 }, 2)?.seen).toEqual([]);
  expect(() =>
    advancePage({ ...state, sequence: 9999 }, { ...page, nextPage: 5 }, 2),
  ).toThrow();
  expect(advancePage(state, { ...page, nextPage: 5 }, 2)?.position).toEqual({
    kind: "page",
    page: 5,
  });
  expect(() => advancePage(state, { ...page, nextPage: 4 }, 2)).toThrow();
  expect(() => advancePage(state, page, 1)).toThrow();
});
it("keeps opaque cursors bound to the source, credential revision and query", () => {
  const first = continuation(undefined, context, "cursor");
  expect(pageRequest(first)).toEqual({ cursor: null });
  const next = advancePage(
    first,
    { ...page, next: { kind: "cursor", cursor: "opaque:α/==" } },
    2,
  )!;
  expect(pageRequest(continuation(next, context, "cursor"))).toEqual({
    cursor: "opaque:α/==",
  });
  for (const changed of [
    { ...context, sourceId: "b" },
    { ...context, revision: 2 },
    { ...context, query: { from: "2026-02-01", limit: 2 } },
  ])
    expect(() => continuation(next, changed, "cursor")).toThrow();
  expect(() =>
    advancePage(
      next,
      { ...page, next: { kind: "cursor", cursor: "opaque:α/==" } },
      2,
    ),
  ).toThrow();
  expect(() => advancePage(next, page, 2)).toThrow();
  expect(advancePage(next, { ...page, next: null }, 2)).toBeNull();
  expect(() =>
    advancePage(next, { ...page, next: { kind: "offset", offset: 2 } }, 2),
  ).toThrow();
});
it("advances offsets by actual rows, preserving a short nonterminal page", () => {
  const state = continuation(undefined, context, "offset");
  const next = advancePage(
    state,
    { ...page, records: [1], next: { kind: "offset", offset: 1 } },
    2,
  )!;
  expect(pageRequest(next)).toEqual({ offset: 1 });
  expect(next.seen).toEqual([]);
  expect(() =>
    advancePage(
      next,
      { ...page, records: [], next: { kind: "offset", offset: 2 } },
      2,
    ),
  ).toThrow();
  expect(() =>
    advancePage(next, { ...page, next: { kind: "offset", offset: 50 } }, 2),
  ).toThrow();
});
