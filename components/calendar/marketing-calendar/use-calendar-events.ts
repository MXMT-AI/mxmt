"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/fetch";
import type { DbEvent, EventDialogState, EventDraft } from "./calendar-types";
import { calendarMarketingCalendarUseCalendarEventsMessages as englishCopy } from "@/messages/en.json";

export function useCalendarEvents(initialEvents: DbEvent[]) {
  const [dbEvents, setDbEvents] = useState(initialEvents);
  const [deleteError, setDeleteError] = useState(false);

  async function saveEvent(dialog: EventDialogState, draft: EventDraft) {
    const editing = dialog.mode === "edit";
    const response = await apiFetch(editing ? `/api/calendar/events/${encodeURIComponent(dialog.id)}` : "/api/calendar/events", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? { type: draft.type, label: draft.label } : draft),
    });
    if (!response.ok) throw new Error(englishCopy.errorCalendarEventSaveFailed);

    const saved: DbEvent = await response.json();
    setDbEvents(previous => editing
      ? previous.map(event => event.id === saved.id ? saved : event)
      : [...previous, saved]);
  }

  async function deleteEvent(id: string) {
    setDeleteError(false);
    try {
      const response = await apiFetch(`/api/calendar/events/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(englishCopy.errorCalendarEventDeleteFailed);
      setDbEvents(previous => previous.filter(event => event.id !== id));
    } catch {
      setDeleteError(true);
    }
  }

  return { dbEvents, deleteError, saveEvent, deleteEvent };
}
