export function RepricingPercentageField({ name, label, min, max, step, value, invalid = false, describedBy, onChange }: {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span>{label}: <strong className="tabular-nums">{value}%</strong></span>
      <input
        type="range"
        className="block w-full min-h-11 accent-(--text) touch-pan-y"
        name={name}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={event => onChange(Number(event.target.value))}
      />
      <span className="flex justify-between text-xs text-(--muted)">
        <span>{min}%</span>
        <span>{max}%</span>
      </span>
    </label>
  );
}
