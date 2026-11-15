import { control } from "@/components/ui/control-styles/control-styles";

type RangeEndpoint = {
  name: string;
  value: string | number;
  onChange: (value: string) => void;
};

export function RangeField({ label, fromLabel, toLabel, from, to, invalid = false, describedBy }: {
  label: string;
  fromLabel: string;
  toLabel: string;
  from: RangeEndpoint;
  to: RangeEndpoint;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs text-(--muted)">{label}</legend>
      <div className="flex items-center gap-2">
        {([{ ...from, label: fromLabel }, { ...to, label: toLabel }]).map(endpoint => (
          <input
            key={endpoint.name}
            aria-label={`${label} — ${endpoint.label}`}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={control}
            name={endpoint.name}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={`${endpoint.label}…`}
            value={endpoint.value}
            onChange={event => endpoint.onChange(event.target.value)}
          />
        ))}
      </div>
    </fieldset>
  );
}
