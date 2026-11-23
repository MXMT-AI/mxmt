import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Field } from "@/components/ui/field/field";
import { Button } from "@/components/ui/button/button";
import { control } from "@/components/ui/control-styles/control-styles";
import type { Lang } from "@/lib/translations";
import { settingsBrandAliasesSectionMessages as englishCopy } from "@/messages/en.json";
import { settingsBrandAliasesSectionMessages as ukrainianCopy } from "@/messages/uk.json";

export function BrandAliasesSection({ aliases, brands, alias, brandId, lang, canManage, busy, loading, onAliasChange, onBrandChange, onSave }: {
  aliases: Array<{ value: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  alias: string;
  brandId: string;
  lang: Lang;
  canManage: boolean;
  busy: boolean;
  loading: boolean;
  onAliasChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onSave: (alias: string, brandId: string | null) => void | Promise<void>;
}) {
  const copy = lang === "uk" ? ukrainianCopy : englishCopy;
  const disabled = busy || loading;
  return (
    <>
      <Heading as="h3" variant="compact" className="mt-6 text-base font-medium">{copy.brandAliases}</Heading>
      <Text variant="body" className="mt-1 leading-normal text-(--muted)">
        {copy.caseAndOuterWhitespaceNormalize}
      </Text>
      {aliases.map(item => (
        <div key={item.value} className="mt-2 flex flex-wrap items-center gap-2 text-sm text-(--text)">
          <span translate="no" className="wrap-break-word">{item.value} → {item.name}</span>
          {canManage && (
            <Button variant="report" disabled={disabled} onClick={() => void onSave(item.value, null)} aria-label={`${copy.removeAlias} ${item.value}`}>
              {copy.remove}
            </Button>
          )}
        </div>
      ))}
      {canManage && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void onSave(alias, brandId); }}>
          <Field label={copy.sourceSpelling} className="flex-1 gap-0 text-sm">
            <input name="brand-alias" className={control + " mt-1 block w-full"} disabled={disabled} autoComplete="off" required maxLength={200} value={alias} onChange={event => onAliasChange(event.target.value)} />
          </Field>
          <Field label={copy.brand} className="flex-1 gap-0 text-sm">
            <select className={control + " mt-1 block w-full"} disabled={disabled} required value={brandId} onChange={event => onBrandChange(event.target.value)}>
              <option value="">{copy.chooseABrand}</option>
              {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
          </Field>
          <Button variant="report" type="submit" disabled={disabled}>{busy ? copy.saving : copy.saveAlias}</Button>
        </form>
      )}
    </>
  );
}
