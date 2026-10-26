"use client";
import { useId, useState, type ReactNode } from "react";
export const control =
  "min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
/** Keep native single-control labels consistent across scenario workspaces. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs text-[var(--muted)]">
      {label}
      {children}
    </label>
  );
}
/** Bound native suggestions, while allowing deep-linked IDs and searching all frozen choices. */
export function Choice({
  label,
  value,
  options,
  all,
  copy,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; name: string | null }>;
  all: string;
  copy: { optionsSearch: string; unassigned: string };
  onChange: (value: string) => void;
}) {
  const id = useId(),
    [search, setSearch] = useState("");
  const selected = options.find((o) => o.id === value);
  const matching = options
    .filter((o) =>
      (o.name ?? o.id).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .slice(0, 100);
  const visible =
    selected && !matching.some((o) => o.id === value)
      ? [selected, ...matching]
      : matching;
  return (
    <fieldset className="min-w-0 space-y-1.5 text-xs text-[var(--muted)]">
      <legend>{label}</legend>
      {options.length > 100 ? (
        <input
          className={control}
          name={id + "-search"}
          type="search"
          aria-label={label + " — " + copy.optionsSearch}
          value={search}
          autoComplete="off"
          placeholder={copy.optionsSearch + "…"}
          onChange={(e) => setSearch(e.target.value)}
        />
      ) : null}
      <select
        aria-label={label}
        className={control}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{all}</option>
        {value && !selected ? <option value={value}>{value}</option> : null}
        {visible.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name ?? copy.unassigned}
          </option>
        ))}
      </select>
    </fieldset>
  );
}
