import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import type { CsvOptions } from "@/lib/connectors/csv/schema";
import type { Lang } from "@/lib/translations";

export type CsvPacketSettingValues = Pick<CsvOptions, "timezone" | "mappingRevision"> & Pick<CsvOptions["policy"]["amounts"], "currency">;

export function CsvPacketSettings({ value, timezoneLocked, lang, onChange }: {
  value: CsvPacketSettingValues;
  timezoneLocked: boolean;
  lang: Lang;
  onChange: (value: CsvPacketSettingValues) => void;
}) {
  const copy = (uk: string, en: string) => lang === "uk" ? uk : en;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label={copy("Часовий пояс дат", "Date timezone")}>
        <input className={control} value={value.timezone} readOnly={timezoneLocked} required maxLength={100} onChange={event => onChange({ ...value, timezone: event.target.value })} />
      </Field>
      <Field label={copy("Валюта сум", "Amount currency")}>
        <input className={control} value={value.currency} required pattern="[A-Z]{3}" maxLength={3} onChange={event => onChange({ ...value, currency: event.target.value.toUpperCase() })} />
      </Field>
      <Field label={copy("Версія мапінгу", "Mapping revision")}>
        <input className={control} type="number" min={1} max={1000000} required value={value.mappingRevision} onChange={event => onChange({ ...value, mappingRevision: Number(event.target.value) })} />
      </Field>
    </div>
  );
}
