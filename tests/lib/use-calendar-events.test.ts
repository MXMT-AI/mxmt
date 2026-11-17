import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { useCalendarEvents } from "@/components/calendar/marketing-calendar/use-calendar-events";
import type { DbEvent, EventDialogState } from "@/components/calendar/marketing-calendar/calendar-types";

vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn() }));
const setEvents = vi.fn(), setError = vi.fn();
const original: DbEvent = { id: "event/1", rowKey: "accent", weekKey: "w47", type: "promo", label: "Original" };
const draft = { rowKey: "accent", weekKey: "w48", type: "sale", label: "Updated" };
const other = { ...original, id: "other" };

function start() {
  vi.mocked(useState).mockReturnValueOnce([[original], setEvents]).mockReturnValueOnce([false, setError]);
  return useCalendarEvents([original]);
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiFetch).mockReset(); });

it.each(["add", "edit"] as const)("saves an %s event and updates the latest event list", async mode => {
  const saved = { ...original, ...draft };
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify(saved)));
  const dialog: EventDialogState = mode === "add" ? { mode, rowKey: draft.rowKey, weekKey: draft.weekKey } : { mode, ...original };
  await start().saveEvent(dialog, draft);
  expect(apiFetch).toHaveBeenCalledWith(mode === "add" ? "/api/calendar/events" : "/api/calendar/events/event%2F1", {
    method: mode === "add" ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mode === "add" ? draft : { type: draft.type, label: draft.label }),
  });
  const update = setEvents.mock.calls[0][0];
  const previous = [original, other];
  expect(update(previous)).toEqual(mode === "add" ? [original, other, saved] : [saved, other]);
  expect(previous).toEqual([original, other]);
});

it.each(["http", "network"])("propagates a save %s failure to the dialog without changing events", async failure => {
  if (failure === "http") vi.mocked(apiFetch).mockResolvedValueOnce(new Response("", { status: 500 }));
  else vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Offline"));
  await expect(start().saveEvent({ mode: "add", ...draft }, draft)).rejects.toThrow();
  expect(setEvents).not.toHaveBeenCalled();
});

it("deletes only the requested event from the latest list", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
  await start().deleteEvent(original.id);
  expect(apiFetch).toHaveBeenCalledWith("/api/calendar/events/event%2F1", { method: "DELETE" });
  expect(setEvents.mock.calls[0][0]([original, other])).toEqual([other]);
  expect(setError.mock.calls).toEqual([[false]]);
});

it.each(["http", "network"])("keeps events after a delete %s failure and clears the error on retry", async failure => {
  if (failure === "http") vi.mocked(apiFetch).mockResolvedValueOnce(new Response("", { status: 500 }));
  else vi.mocked(apiFetch).mockRejectedValueOnce(new Error());
  const state = start();
  await state.deleteEvent(original.id);
  expect(setError).toHaveBeenLastCalledWith(true);
  expect(setEvents).not.toHaveBeenCalled();
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
  await state.deleteEvent(original.id);
  expect(setError).toHaveBeenLastCalledWith(false);
  expect(setEvents).toHaveBeenCalledOnce();
});
