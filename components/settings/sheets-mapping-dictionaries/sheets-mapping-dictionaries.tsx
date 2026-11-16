import { Field } from "@/components/ui/field/field";
import { Text } from "@/components/ui/text/text";
import { control } from "@/components/ui/control-styles/control-styles";
import { SHEETS_EVENT_KINDS, type SheetsFieldMapping, type SheetsMappingMetadata } from "@/lib/sheets-mapping-contract";
import type { Lang } from "@/lib/translations";
import { mappingCaption } from "../sheets-mapping-card/copy";

type Policy = SheetsFieldMapping["policy"];
const productKinds = ["UNKNOWN", "MERCHANDISE", "SERVICE", "GIFT_CARD"] as const;
function ownValue<T>(entries: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(entries, key) ? entries[key] : undefined;
}
function setEntry<T>(entries: Record<string, T>, key: string, value: T | null) {
  if (value === null) delete entries[key];
  else Object.defineProperty(entries, key, { value, enumerable: true, configurable: true, writable: true });
}

export function SheetsMappingDictionaries({ policy, observed, lang, onChange }: {
  policy: Policy;
  observed: SheetsMappingMetadata["observed"];
  lang: Lang;
  onChange: (update: (policy: Policy) => void) => void;
}) {
  const uk = lang === "uk";
  const statuses = [...new Set([...Object.keys(policy.statuses), ...observed.statuses.map(status => status.id)])].sort();
  return (
    <>
      <fieldset className="space-y-3">
        <legend className="font-medium">{uk ? "Статуси джерела" : "Source statuses"}</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {statuses.map(status => (
            <Field key={status} label={uk ? `Статус ${status}` : `Status ${status}`}>
              <select className={control} value={ownValue(policy.statuses, status) ?? "UNKNOWN"} onChange={event => {
                const kind = SHEETS_EVENT_KINDS.find(kind => kind === event.target.value);
                if (kind) onChange(draft => setEntry(draft.statuses, status, kind));
              }}>
                {SHEETS_EVENT_KINDS.map(kind => <option key={kind} value={kind}>{mappingCaption(kind, lang)}</option>)}
              </select>
            </Field>
          ))}
        </div>
        <Text variant="body" className="leading-normal text-(--muted)">
          {uk ? "Непідтверджені статуси виключаються з фінансових показників. Дата зміни рядка не є підтвердженою датою повернення."
            : "Unverified statuses are excluded from financial metrics. A row update timestamp does not prove a return date."}
        </Text>
      </fieldset>
      {observed.channels.length > 0 && (
        <fieldset>
          <legend className="font-medium">{uk ? "Канали" : "Channels"}</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {observed.channels.map(channel => (
              <Field key={channel.id} label={uk ? `Канал ${channel.id}` : `Channel ${channel.id}`}>
                <input className={control} autoComplete="off" maxLength={200} value={ownValue(policy.channels, channel.id) ?? ""} onChange={event => {
                  const value = event.target.value;
                  onChange(draft => setEntry(draft.channels, channel.id, value || null));
                }} />
              </Field>
            ))}
          </div>
        </fieldset>
      )}
      {observed.categories.length > 0 && (
        <details className="rounded-lg border border-(--border) p-3">
          <summary className="cursor-pointer font-medium">{uk ? "Типи позицій за категоріями" : "Product kinds by category"}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {observed.categories.map(category => (
              <Field key={category.name} label={category.name}>
                <select className={control} value={ownValue(policy.productKinds, category.name) ?? ""} onChange={event => {
                  const value = event.target.value;
                  if (!value) onChange(draft => setEntry(draft.productKinds, category.name, null));
                  else {
                    const kind = productKinds.find(kind => kind === value);
                    if (kind) onChange(draft => setEntry(draft.productKinds, category.name, kind));
                  }
                }}>
                  <option value="">{uk ? "За замовчуванням" : "Use default"}</option>
                  {productKinds.map(kind => <option key={kind} value={kind}>{mappingCaption(kind, lang)}</option>)}
                </select>
              </Field>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
