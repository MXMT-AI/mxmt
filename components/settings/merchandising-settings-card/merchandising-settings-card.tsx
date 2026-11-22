"use client";
import { Field } from "@/components/ui/field/field";
import { Button } from "@/components/ui/button/button";
import { Text } from "@/components/ui/text/text";
import { Heading } from "@/components/ui/heading/heading";
import { panel } from "@/components/ui/panel/panel-styles";
import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import type { SettingsResource } from "@/lib/merchandising-settings";
import { SettingsEditor } from "../settings-editor/settings-editor";
import { useMerchandisingSettings } from "./use-merchandising-settings";
import { inputClass, buttonClass } from "./merchandising-settings-styles";
import { settingsMerchandisingSettingsCardMessages as englishCopy } from "@/messages/en.json";
import { settingsMerchandisingSettingsCardMessages as ukrainianCopy } from "@/messages/uk.json";

export default function MerchandisingSettingsCard({
  lang,
  canManage,
  onDirtyChange,
}: {
  lang: "uk" | "en";
  canManage: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const uk = lang === "uk";
  const [resource, setResource] = useState<SettingsResource>("client"),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(""),
    [dirty, setDirty] = useState(false),
    [notice, setNotice] = useState("");
  const { data, error, loading, load, clear } = useMerchandisingSettings(resource, page, search, lang);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (dirty) setNotice("");
  }, [dirty]);
  const leave = () =>
    !dirty ||
    window.confirm(
      uk ? ukrainianCopy.discardUnsavedChanges : englishCopy.discardUnsavedChanges,
    );
  const labels: Record<SettingsResource, string> = uk
    ? {
        client: ukrainianCopy.clientКлієнт,
        brand: ukrainianCopy.brandБренди,
        sku: "SKU",
        supplier: ukrainianCopy.supplierПостачальники,
        category: ukrainianCopy.categoryКатегорії,
      }
    : {
        client: englishCopy.client,
        brand: englishCopy.brand,
        sku: "SKUs",
        supplier: englishCopy.supplier,
        category: englishCopy.categoryCategories,
      };
  const item =
    selected === "new"
      ? null
      : (data?.items.find((row) => row.id === selected) ??
        data?.items[0] ??
        null);
  return (
    <section
      aria-labelledby="merchandising-settings-title"
      className={panel + " p-5"}
    >
      <Heading as="h2" variant="compact"
        id="merchandising-settings-title"
        className="text-base"
      >
        {uk ? ukrainianCopy.merchandisingRules : englishCopy.merchandisingRules}
      </Heading>
      <Text variant="body" className="leading-normal text-inherit mt-1 text-sm text-(--muted)">
        {uk
          ? ukrainianCopy.clientOwnershipAndSupplyPolicies
          : englishCopy.clientOwnershipAndSupplyPolicies}
      </Text>
      <nav
        aria-label={uk ? ukrainianCopy.ariaLabelMerchandisingSections : englishCopy.ariaLabelMerchandisingSections}
        className="mt-4 flex flex-wrap gap-2"
      >
        {Object.entries(labels).map(([key, label]) => (
          <Button variant="report"
            key={key}
            type="button"
            aria-pressed={resource === key}
            className={
              buttonClass + (resource === key ? " bg-(--bg)" : "")
            }
            onClick={() => {
              if (key !== resource && leave()) {
                setDirty(false);
                setNotice("");
                clear();
                setSelected("");
                setPage(1);
                setSearch("");
                setQuery("");
                setResource(key as SettingsResource);
              }
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      {notice && (
        <Text variant="body" role="status" className="leading-normal text-inherit mt-3 text-sm text-(--muted)">
          {notice}
        </Text>
      )}
      {error && (
        <Text variant="body" role="alert" className="leading-normal text-inherit mt-3 text-sm text-red-500">
          {error}
        </Text>
      )}
      {loading && (
        <Text variant="body" role="status" className="leading-normal text-inherit mt-3 text-sm text-(--muted)">
          {uk ? ukrainianCopy.loading : englishCopy.loading}
        </Text>
      )}
      {resource !== "client" && (
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (leave()) {
              setDirty(false);
              setSelected("");
              setPage(1);
              setSearch(query);
            }
          }}
        >
          <Field label={uk ? ukrainianCopy.labelSearchNameOrSKU : englishCopy.labelSearchNameOrSKU} className="flex-1 gap-0 text-sm">
            <input
              className={inputClass}
              name="merch-search"
              autoComplete="off"
              maxLength={200}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <Button variant="report" type="submit" className={buttonClass}>{uk ? ukrainianCopy.search : englishCopy.search}</Button>
        </form>
      )}
      {data && !loading && (
        <>
          {resource !== "client" && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Field label={labels[resource]} className="flex-1 gap-0 text-sm">
                <select
                  className={inputClass}
                  value={selected === "new" ? "new" : (item?.id ?? "")}
                  onChange={(e) => {
                    if (leave()) {
                      setDirty(false);
                      setSelected(e.target.value);
                    }
                  }}
                >
                  {selected === "new" && (
                    <option value="new">
                      {uk ? ukrainianCopy.newSupplier : englishCopy.newSupplier}
                    </option>
                  )}
                  {!data.items.length && selected !== "new" && (
                    <option value="">
                      {uk ? ukrainianCopy.noRecords : englishCopy.noRecords}
                    </option>
                  )}
                  {data.items.map((row) => (
                    <option key={row.id} value={row.id}>
                      {String(row.sku ?? row.name)}
                      {row.sku ? ` · ${row.name}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {resource === "supplier" && canManage && (
                <Button variant="report"
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    if (leave()) {
                      setDirty(false);
                      setSelected("new");
                    }
                  }}
                >
                  {uk ? ukrainianCopy.addSupplier : englishCopy.addSupplier}
                </Button>
              )}
            </div>
          )}
          {resource === "client" || item || selected === "new" ? (
            <SettingsEditor
              key={`${resource}:${item?.id ?? "new"}:${resource === "client" ? data.client.revision : (item?.revision ?? 0)}`}
              lang={lang}
              canManage={canManage}
              resource={resource}
              item={item}
              data={data}
              onDirty={setDirty}
              onSaved={async (id, newName) => {
                setDirty(false);
                if (id) setSelected(id);
                if (newName && (page !== 1 || search !== newName)) {
                  setPage(1);
                  setQuery(newName);
                  setSearch(newName);
                } else await load();
                setNotice(
                  uk
                    ? ukrainianCopy.savedNewImportsApplyStatusExclusion
                    : englishCopy.savedNewImportsApplyStatusExclusion,
                );
              }}
            />
          ) : (
            <Text variant="body" className="leading-normal text-inherit mt-4 text-sm text-(--muted)">
              {uk
                ? ukrainianCopy.noRecordsYetImportA
                : englishCopy.noRecordsYetImportA}
            </Text>
          )}
          {resource !== "client" && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="report"
                className={buttonClass}
                disabled={page === 1}
                onClick={() => {
                  if (leave()) {
                    setDirty(false);
                    setSelected("");
                    setPage((p) => p - 1);
                  }
                }}
              >
                {uk ? ukrainianCopy.previous : englishCopy.previous}
              </Button>
              <span className="text-sm text-(--muted)">
                {page} /{" "}
                {Math.max(1, Math.ceil(data.pagination.totalRows / 25))}
              </span>
              <Button variant="report"
                className={buttonClass}
                disabled={page * 25 >= data.pagination.totalRows}
                onClick={() => {
                  if (leave()) {
                    setDirty(false);
                    setSelected("");
                    setPage((p) => p + 1);
                  }
                }}
              >
                {uk ? ukrainianCopy.next : englishCopy.next}
              </Button>
            </div>
          )}
        </>
      )}
      <Text variant="body" className="leading-normal text-inherit mt-5 text-sm text-(--muted)">
        <Link
          href="/settings?tab=general#data-quality-title"
          className="underline focus-visible:outline-solid"
        >
          {uk
            ? ukrainianCopy.brandAliasesAndProductTypes
            : englishCopy.brandAliasesAndProductTypes}
        </Link>
      </Text>
    </section>
  );
}
