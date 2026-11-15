import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";
import { calendarChipTypes } from "../marketing-calendar/calendar-chip-types";
import type { Chip, ChipType } from "../marketing-calendar/calendar-types";

export function CalendarChip({ chip, editLabel, deleteLabel, onEdit, onDelete }: {
  chip: Chip;
  editLabel: string;
  deleteLabel: string;
  onEdit: (chip: Chip & { id: string }) => void;
  onDelete: (id: string) => void;
}) {
  const palette = Object.hasOwn(calendarChipTypes, chip.t)
    ? calendarChipTypes[chip.t as ChipType]
    : calendarChipTypes.promo;
  const { id } = chip;
  const edit = id ? () => onEdit({ ...chip, id }) : undefined;
  const actionClassName = "border-0 p-0.5 text-current hover:bg-transparent hover:text-current hover:opacity-70";

  return (
    <div className={cn("group mb-1 flex items-center justify-between gap-1 rounded-sm px-2 py-1 text-xs font-medium", palette.fill, palette.ink)} title={chip.l}>
      {edit ? (
        <button type="button" onClick={edit} className="min-w-0 flex-1 cursor-pointer truncate text-left leading-snug">
          {chip.l}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate leading-snug">{chip.l}</span>
      )}
      {id && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          <Button onClick={edit} aria-label={editLabel} className={actionClassName}>
            <Pencil size={9} aria-hidden="true" />
          </Button>
          <Button onClick={() => onDelete(id)} aria-label={deleteLabel} className={actionClassName}>
            <X size={9} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
