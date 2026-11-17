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
      uk ? "Є незбережені зміни. Відкинути їх?" : "Discard unsaved changes?",
    );
  const labels: Record<SettingsResource, string> = uk
    ? {
        client: "Клієнт",
        brand: "Бренди",
        sku: "SKU",
        supplier: "Постачальники",
        category: "Категорії",
      }
    : {
        client: "Client",
        brand: "Brands",
        sku: "SKUs",
        supplier: "Suppliers",
        category: "Categories",
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
        {uk ? "Правила мерчандайзингу" : "Merchandising rules"}
      </Heading>
      <Text variant="body" className="leading-normal text-inherit mt-1 text-sm text-(--muted)">
        {uk
          ? "Налаштування клієнта, власності й постачання. Зміни зберігаються з версією та журналом."
          : "Client, ownership and supply policies. Changes retain revisions and an audit trail."}
      </Text>
      <nav
        aria-label={uk ? "Розділи мерчандайзингу" : "Merchandising sections"}
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
          {uk ? "Завантаження…" : "Loading…"}
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
          <Field label={uk ? "Пошук назви або SKU" : "Search name or SKU"} className="flex-1 gap-0 text-sm">
            <input
              className={inputClass}
              name="merch-search"
              autoComplete="off"
              maxLength={200}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <Button variant="report" type="submit" className={buttonClass}>{uk ? "Знайти" : "Search"}</Button>
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
                      {uk ? "Новий постачальник" : "New supplier"}
                    </option>
                  )}
                  {!data.items.length && selected !== "new" && (
                    <option value="">
                      {uk ? "Немає записів" : "No records"}
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
                  {uk ? "Додати постачальника" : "Add supplier"}
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
                    ? "Збережено. Нові імпорти застосують статуси й виключення; звіти очікують перерахунку."
                    : "Saved. New imports apply status/exclusion rules; reports await recalculation.",
                );
              }}
            />
          ) : (
            <Text variant="body" className="leading-normal text-inherit mt-4 text-sm text-(--muted)">
              {uk
                ? "Записів ще немає. Імпортуйте каталог, щоб налаштувати бренди, товари й категорії."
                : "No records yet. Import a catalog to configure brands, products and categories."}
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
                {uk ? "Назад" : "Previous"}
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
                {uk ? "Далі" : "Next"}
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
            ? "Аліаси брендів і типи товарів — у «Якість даних»."
            : "Brand aliases and product types are managed in Data quality."}
        </Link>
      </Text>
    </section>
  );
}
