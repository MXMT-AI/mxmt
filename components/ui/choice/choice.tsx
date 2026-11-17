"use client";

import { useId, useState } from "react";
import { control } from "../control-styles/control-styles";

const optionLimit = 100;

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
  const searchable = options.length > optionLimit;
  const query = search.toLocaleLowerCase();
  const matching = (searchable
    ? options.filter(option => (option.name ?? option.id).toLocaleLowerCase().includes(query))
    : options).slice(0, optionLimit);
  const visible =
    selected && !matching.some((o) => o.id === value)
      ? [selected, ...matching]
      : matching;
  return (
    <fieldset className="min-w-0 space-y-1.5 text-xs text-(--muted)">
      <legend>{label}</legend>
      {searchable ? (
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
