import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button/button";
import { Dialog } from "@/components/ui/dialog/dialog";
import { Field } from "@/components/ui/field/field";
import { controlBase } from "@/components/ui/control-styles/control-styles";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";
import { calendarChipTypes, calendarEventTypes } from "../marketing-calendar/calendar-chip-types";
import { calendarRows } from "../marketing-calendar/calendar-rows";
import type { EventDialogState, EventDraft, Week } from "../marketing-calendar/calendar-types";
import { calendarCalendarEventDialogMessages as englishCopy } from "@/messages/en.json";
import { calendarCalendarEventDialogMessages as ukrainianCopy } from "@/messages/uk.json";

const controlClassName = cn(controlBase, "w-full bg-(--surface2) py-2 text-sm focus:border-accent-cyan/40");
const labelClassName = "font-mono text-[10px] tracking-widest uppercase";

function EventSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} className={labelClassName}>
      <select className={controlClassName} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  );
}

export function CalendarEventDialog({ event, weeks, locale, onSave, onClose }: {
  event: EventDialogState;
  weeks: Week[];
  locale: Locale;
  onSave: (draft: EventDraft) => Promise<void>;
  onClose: () => void;
}) {
  const uk = locale === "uk";
  const adding = event.mode === "add";
  const [draft, setDraft] = useState<EventDraft>({
    rowKey: event.rowKey,
    weekKey: event.weekKey,
    type: adding ? "promo" : event.type,
    label: adding ? "" : event.label,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const typeOptions: { value: string; label: string }[] = calendarEventTypes.map((value) => ({
    value, label: calendarChipTypes[value].option[locale],
  }));
  if (!adding && !typeOptions.some((option) => option.value === event.type)) {
    typeOptions.push({ value: event.type, label: event.type === "agent" ? calendarChipTypes.agent.legend[locale] : event.type });
  }
  const rowOptions = calendarRows.flatMap((row) => row.t === "r" ? [{ value: row.k, label: row.l }] : []);
  const weekOptions = weeks.map((week) => ({ value: week.k, label: `${week.l} · ${week.d}` }));

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (saving || !draft.label.trim()) return;

    setSaving(true);
    setError(false);
    try {
      await onSave(draft);
      onClose();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={adding ? (uk ? ukrainianCopy.titleAddEvent : englishCopy.titleAddEvent) : (uk ? ukrainianCopy.titleEditEvent : englishCopy.titleEditEvent)}
      closeLabel={uk ? ukrainianCopy.closeLabelClose : englishCopy.closeLabelClose}
      closeDisabled={saving}
      onClose={onClose}
      className="max-w-xs"
    >
      <form className="space-y-4 p-5" onSubmit={submit}>
        <fieldset disabled={saving} className="space-y-3">
          <EventSelect label={uk ? ukrainianCopy.labelType : englishCopy.labelType} value={draft.type} options={typeOptions} onChange={(type) => setDraft({ ...draft, type })} />
          {adding && (
            <>
              <EventSelect label={uk ? ukrainianCopy.labelChannel : englishCopy.labelChannel} value={draft.rowKey} options={rowOptions} onChange={(rowKey) => setDraft({ ...draft, rowKey })} />
              <EventSelect label={uk ? ukrainianCopy.labelWeek : englishCopy.labelWeek} value={draft.weekKey} options={weekOptions} onChange={(weekKey) => setDraft({ ...draft, weekKey })} />
            </>
          )}
          <Field label={uk ? ukrainianCopy.labelName : englishCopy.labelName} className={labelClassName}>
            <input
              type="text"
              value={draft.label}
              onChange={(inputEvent) => setDraft({ ...draft, label: inputEvent.target.value })}
              className={controlClassName}
              placeholder={adding ? (uk ? ukrainianCopy.placeholderEG20OnKOMONOWatches : englishCopy.placeholderEG20OnKOMONOWatches) : undefined}
              required
            />
          </Field>
        </fieldset>

        {error && <p role="alert" className="text-sm text-accent-danger">{uk ? ukrainianCopy.couldNotSaveTheEvent : englishCopy.couldNotSaveTheEvent}</p>}

        <div className="flex gap-3">
          <Button onClick={onClose} disabled={saving} className="flex-1 justify-center py-2 font-sans text-sm">
            {uk ? ukrainianCopy.cancel : englishCopy.cancel}
          </Button>
          <Button variant="accent" type="submit" disabled={saving || !draft.label.trim()} className="flex-1 py-2">
            {saving ? "…" : adding ? (uk ? ukrainianCopy.add : englishCopy.add) : (uk ? ukrainianCopy.save : englishCopy.save)}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
