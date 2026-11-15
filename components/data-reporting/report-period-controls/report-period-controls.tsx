import { useId } from "react";
import { CalendarDays } from "lucide-react";
import { DateField } from "@/components/ui/date-field/date-field";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";

export function ReportPeriodControls({ copy, dateFrom, dateTo, error, onDateFromChange, onDateToChange }: {
  copy: { reportPeriod: string; periodHelp: string; dateFrom: string; dateTo: string };
  dateFrom: string;
  dateTo: string;
  error: string | null;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}) {
  const id = useId();
  const headingId = `${id}-heading`;
  const errorId = `${id}-error`;

  return (
    <section aria-labelledby={headingId} className="mb-4 rounded-xl border border-(--border) bg-(--surface) px-4 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:gap-5">
        <div className="flex items-start gap-2 xl:min-w-72">
          <CalendarDays size={16} className="mt-0.5 shrink-0 text-accent-cyan" aria-hidden="true" />
          <div>
            <Heading as="h2" variant="compact" id={headingId} className="font-medium">{copy.reportPeriod}</Heading>
            <Text variant="body" className="mt-0.5 text-[11px] leading-normal">{copy.periodHelp}</Text>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <DateField
            variant="stacked" id={`${id}-from`} label={copy.dateFrom}
            value={dateFrom} max={dateTo || undefined}
            aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
            onChange={(event) => onDateFromChange(event.target.value)}
          />
          <DateField
            variant="stacked" id={`${id}-to`} label={copy.dateTo}
            value={dateTo} min={dateFrom || undefined}
            aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
            onChange={(event) => onDateToChange(event.target.value)}
          />
        </div>
      </div>
      {error && <p role="alert" id={errorId} className="mt-2 text-xs text-accent-danger">{error}</p>}
    </section>
  );
}
