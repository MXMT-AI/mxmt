"use client";
import { Button } from "@/components/ui/button/button";
import { Text } from "@/components/ui/text/text";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SettingsResource } from "@/lib/merchandising-settings";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import PrimaryBrandCreator from "../primary-brand-creator/primary-brand-creator";
import { MerchandisingField as Field } from "../merchandising-field/merchandising-field";
import { PolicyPreview } from "../policy-preview/policy-preview";
import type { Entity, Payload } from "../merchandising-settings-card/merchandising-settings-types";
import { inputClass, buttonClass } from "../merchandising-settings-card/merchandising-settings-styles";
import { currentKyivMonth } from "../merchandising-settings-card/current-kyiv-month";

export function SettingsEditor({
  lang,
  canManage,
  resource,
  item,
  data,
  onDirty,
  onSaved,
}: {
  lang: "uk" | "en";
  canManage: boolean;
  resource: SettingsResource;
  item: Entity | null;
  data: Payload;
  onDirty: (value: boolean) => void;
  onSaved: (id: string | null, newName?: string) => Promise<void>;
}) {
  const uk = lang === "uk",
    client = resource === "client",
    revision = client ? data.client.revision : (item?.revision ?? 0);
  const initial: Record<string, unknown> = client
    ? { ...structuredClone(data.client.values) }
    : resource === "brand"
      ? {
          ownership: item?.ownership ?? "UNKNOWN",
          commissionPct:
            item?.commissionPct == null ? null : Number(item.commissionPct),
          supplierId: item?.supplierId ?? null,
        }
      : resource === "sku"
        ? {
            ownershipOverride: item?.ownershipOverride ?? null,
            commissionPct:
              item?.commissionOverridePct == null
                ? null
                : Number(item.commissionOverridePct),
            supplierId: item?.supplierId ?? null,
          }
        : resource === "supplier"
          ? {
              name: item?.name ?? "",
              leadDays: item?.leadTimeDays ?? data.client.values.leadDays,
              coverDays: item?.coverDays ?? data.client.values.coverDays,
              moq: item?.moq ?? data.client.values.moq,
            }
          : {
              seasonMonths: item?.seasonMonths ?? [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
              ],
            };
  const [createdBrands, setCreatedBrands] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [creationKey] = useState(() => crypto.randomUUID());
  const [listDrafts, setListDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ["saleStatuses", "excludedChannels", "excludedProjects"].map((key) => [
        key,
        ((initial[key] ?? []) as string[]).join(", "),
      ]),
    ),
  );
  const [values, setValues] = useState(initial),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({});
  const [planMonth, setPlanMonth] = useState(currentKyivMonth);
  const errorRef = useRef<HTMLParagraphElement>(null),
    formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (error) {
      const invalid = formRef.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      (invalid ?? errorRef.current)?.focus();
    }
  }, [error, fields]);
  const edit = (name: string, value: unknown) => {
    setValues((v) => ({ ...v, [name]: value }));
    setDirty(true);
    setFields((f) => ({ ...f, [name]: "" }));
  };
  const fieldError = (name: string) => {
    const error = fields[name];
    if (!error) return undefined;
    if (error.startsWith("range:")) {
      const [, min, max] = error.split(":");
      return uk
        ? `Вкажіть число від ${min} до ${max}.`
        : `Enter a number between ${min} and ${max}.`;
    }
    if (error === "above_healthy")
      return uk
        ? "Поріг ризику має бути більшим за поріг здорового запасу."
        : "The risk threshold must exceed the healthy threshold.";
    if (error === "currency_required" || error === "invalid_currency")
      return uk
        ? "Вкажіть трилітерний код валюти планів, наприклад UAH."
        : "Enter a three-letter plan currency code, for example UAH.";
    if (error === "project_field_required")
      return uk
        ? "Вкажіть підтверджене поле ID проєкту в SalesDrive."
        : "Enter the verified SalesDrive project-ID field.";
    if (error === "commission_requires_consignment")
      return uk
        ? "Комісія задається для стоку на реалізації."
        : "Commission applies to consignment stock.";
    if (error === "invalid_months")
      return uk
        ? "Виберіть хоча б один місяць сезону."
        : "Select at least one season month.";
    return uk ? "Перевірте значення цього поля." : "Check this field value.";
  };
  const attrs = (name: string) => ({
    id: `merch-${name}`,
    name,
    disabled: !canManage || busy,
    "aria-invalid": Boolean(fields[name]),
    "aria-describedby": fields[name] ? `merch-error-${name}` : undefined,
    className: inputClass,
  });
  const number = (
    name: string,
    label: string,
    min: number,
    max: number,
    step = "1",
    nullable = false,
  ) => (
    <Field key={name} name={name} label={label} error={fieldError(name)}>
      <input
        {...attrs(name)}
        type="number"
        min={min}
        max={max}
        step={step}
        value={values[name] == null ? "" : String(values[name])}
        onChange={(e) =>
          edit(
            name,
            e.target.value === ""
              ? nullable
                ? null
                : ""
              : Number(e.target.value),
          )
        }
      />
    </Field>
  );
  const ids = (name: string, label: string) => (
    <Field key={name} name={name} label={label} error={fieldError(name)}>
      <input
        {...attrs(name)}
        autoComplete="off"
        value={listDrafts[name] ?? ""}
        onChange={(e) => {
          setListDrafts((v) => ({ ...v, [name]: e.target.value }));
          edit(
            name,
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }}
      />
    </Field>
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    let saved = false;
    try {
      const response = await apiFetch("/api/settings/merchandising", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          resource,
          id: client ? null : (item?.id ?? null),
          expectedRevision: revision,
          values,
          ...(resource === "supplier" && !item ? { creationKey } : {}),
        }),
      });
      const result = await readApiJson<{
        fields?: Record<string, string>;
        code?: string;
        id?: string | null;
      }>(response);
      if (!response.ok) {
        if (result.fields) setFields(result.fields);
        throw new Error(result.code ?? "SAVE_FAILED");
      }
      saved = true;
      setDirty(false);
      await onSaved(
        result.id ?? null,
        resource === "supplier" && !item ? String(values.name) : undefined,
      );
    } catch (cause) {
      setError(
        saved
          ? uk
            ? "Зміни збережено, але список не оновився. Перезавантажте налаштування."
            : "Changes saved, but the list could not refresh. Reload settings."
          : cause instanceof Error && cause.message === "SETTINGS_CONFLICT"
            ? uk
              ? "Налаштування вже змінилися. Перезавантажте список і перевірте свої правки."
              : "Settings changed elsewhere. Reload and review your edits."
            : uk
              ? "Не вдалося зберегти. Перевірте позначені поля й повторіть спробу."
              : "Could not save. Check the marked fields and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form ref={formRef} className="mt-5 space-y-5" onSubmit={save} noValidate>
        <Text variant="body" className="leading-normal text-inherit text-sm text-(--muted)">
          {uk ? "Ревізія" : "Revision"}: {revision}
          {!revision &&
            (uk
              ? " · стандартні значення, ще не збережено"
              : " · defaults, not yet saved")}
        </Text>
        {error && (
          <Text variant="body"
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="leading-normal text-inherit text-sm text-red-500"
          >
            {error}
          </Text>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {client ? (
            <>
              <Field
                name="profileMode"
                label={uk ? "Конфігурація брендів" : "Brand configuration"}
                error={fieldError("profileMode")}
              >
                <select
                  {...attrs("profileMode")}
                  value={String(values.profileMode)}
                  onChange={(e) => edit("profileMode", e.target.value)}
                >
                  <option value="MULTIBRAND">
                    {uk ? "Мультибренд" : "Multibrand"}
                  </option>
                  <option value="MONOBRAND">
                    {uk ? "Монобренд" : "Monobrand"}
                  </option>
                </select>
              </Field>
              <Field
                name="monoBrandId"
                label={
                  uk
                    ? "Основний бренд для монобренду"
                    : "Primary brand for monobrand"
                }
                error={fieldError("monoBrandId")}
              >
                <select
                  {...attrs("monoBrandId")}
                  value={String(values.monoBrandId ?? "")}
                  onChange={(e) => edit("monoBrandId", e.target.value || null)}
                >
                  <option value="">
                    {uk ? "Виберіть бренд" : "Choose a brand"}
                  </option>
                  {[
                    ...data.brands,
                    ...createdBrands.filter(
                      (b) =>
                        !data.brands.some((existing) => existing.id === b.id),
                    ),
                  ].map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              {values.profileMode === "MONOBRAND" && canManage && (
                <PrimaryBrandCreator
                  lang={lang}
                  disabled={busy}
                  onCreated={(brand) => {
                    setCreatedBrands((list) => [
                      ...list.filter((b) => b.id !== brand.id),
                      brand,
                    ]);
                    edit("monoBrandId", brand.id);
                  }}
                />
              )}
              {number(
                "minMarginPct",
                uk ? "Мінімальна маржа, %" : "Minimum margin, %",
                0,
                100,
                "0.1",
              )}
              {number(
                "turnoverMonths",
                uk ? "Норма оборотності, місяців" : "Turnover target, months",
                0.01,
                120,
                "0.1",
              )}
              <Field
                name="deadDays"
                label={
                  uk ? "Поріг неліквіду, днів" : "Dead stock threshold, days"
                }
                error={fieldError("deadDays")}
              >
                <select
                  {...attrs("deadDays")}
                  value={String(values.deadDays)}
                  onChange={(e) => edit("deadDays", Number(e.target.value))}
                >
                  {[60, 90, 120].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              {number(
                "healthyWohWeeks",
                uk ? "Здоровий запас до, тижнів" : "Healthy stock up to, weeks",
                0.01,
                520,
                "0.1",
              )}
              {number(
                "riskWohWeeks",
                uk ? "Ризик до, тижнів" : "Risk up to, weeks",
                0.01,
                520,
                "0.1",
              )}
              {number(
                "newProductWeeks",
                uk
                  ? "Карантин новинки, тижнів"
                  : "New product quarantine, weeks",
                0,
                52,
              )}
              {number(
                "leadDays",
                uk
                  ? "Стандартне плече поставки, днів"
                  : "Default supplier lead time, days",
                0,
                3650,
              )}
              {number(
                "coverDays",
                uk
                  ? "Покриття після поставки, днів"
                  : "Post-delivery coverage, days",
                0,
                3650,
              )}
              {number(
                "moq",
                uk ? "Стандартний MOQ, шт" : "Default MOQ, units",
                1,
                1000000,
              )}
              <Field
                name="planMonth"
                label={uk ? "Місяць плану" : "Plan month"}
              >
                <input
                  id="merch-planMonth"
                  name="planMonth"
                  className={inputClass}
                  type="month"
                  value={planMonth}
                  onChange={(e) => setPlanMonth(e.target.value)}
                />
              </Field>
              <Field
                name="planCurrency"
                label={
                  uk ? "Валюта планів, ISO-код" : "Plan currency, ISO code"
                }
                error={fieldError("planCurrency")}
              >
                <input
                  {...attrs("planCurrency")}
                  autoComplete="off"
                  maxLength={3}
                  value={String(values.planCurrency ?? "")}
                  onChange={(e) =>
                    edit("planCurrency", e.target.value.toUpperCase() || null)
                  }
                />
              </Field>
              <Field
                name="monthlyPlans"
                label={
                  uk
                    ? "План виручки, у валюті звітності"
                    : "Revenue plan, reporting currency"
                }
                error={fieldError("monthlyPlans")}
              >
                <input
                  {...attrs("monthlyPlans")}
                  inputMode="decimal"
                  autoComplete="off"
                  value={
                    (values.monthlyPlans as Record<string, string>)[
                      planMonth
                    ] ?? ""
                  }
                  onChange={(e) => {
                    const plans = {
                      ...(values.monthlyPlans as Record<string, string>),
                    };
                    if (e.target.value === "") delete plans[planMonth];
                    else plans[planMonth] = e.target.value;
                    edit("monthlyPlans", plans);
                  }}
                />
              </Field>
              {ids(
                "saleStatuses",
                uk
                  ? "ID статусів-продажів, через кому"
                  : "Sale status IDs, comma separated",
              )}
              <label className="flex items-center gap-2 self-end py-2 text-sm text-(--text)">
                <input
                  type="checkbox"
                  checked={Boolean(values.saleStatusesVerified)}
                  disabled={!canManage || busy}
                  onChange={(e) =>
                    edit("saleStatusesVerified", e.target.checked)
                  }
                />
                {uk
                  ? "Підтверджую значення статусів у цьому акаунті"
                  : "I confirm these statuses for this account"}
              </label>
              {ids(
                "excludedChannels",
                uk ? "Виключені ID каналів" : "Excluded channel IDs",
              )}
              {ids(
                "excludedProjects",
                uk ? "Виключені ID проєктів" : "Excluded project IDs",
              )}
              <Field
                name="projectField"
                label={
                  uk
                    ? "Підтверджене поле ID проєкту в SalesDrive"
                    : "Verified project-ID field in SalesDrive"
                }
                error={fieldError("projectField")}
              >
                <input
                  {...attrs("projectField")}
                  autoComplete="off"
                  value={String(values.projectField ?? "")}
                  onChange={(e) => edit("projectField", e.target.value || null)}
                />
              </Field>
            </>
          ) : resource === "brand" || resource === "sku" ? (
            <>
              <Field
                name={resource === "sku" ? "ownershipOverride" : "ownership"}
                label={uk ? "Власність стоку" : "Stock ownership"}
                error={fieldError(
                  resource === "sku" ? "ownershipOverride" : "ownership",
                )}
              >
                <select
                  {...attrs(
                    resource === "sku" ? "ownershipOverride" : "ownership",
                  )}
                  value={String(
                    values[
                      resource === "sku" ? "ownershipOverride" : "ownership"
                    ] ?? "INHERIT",
                  )}
                  onChange={(e) => {
                    const v = e.target.value;
                    edit(
                      resource === "sku" ? "ownershipOverride" : "ownership",
                      v === "INHERIT" ? null : v,
                    );
                    if (v === "OWN" || v === "UNKNOWN")
                      edit("commissionPct", null);
                  }}
                >
                  {resource === "sku" && (
                    <option value="INHERIT">
                      {uk ? "Успадкувати бренд" : "Inherit brand"}
                    </option>
                  )}
                  <option value="UNKNOWN">{uk ? "Невідомо" : "Unknown"}</option>
                  <option value="OWN">
                    {uk ? "Власний сток" : "Own stock"}
                  </option>
                  <option value="CONSIGNMENT">
                    {uk ? "На реалізації" : "Consignment"}
                  </option>
                </select>
              </Field>
              {number(
                "commissionPct",
                uk
                  ? "Комісія, % · порожньо — невідома або успадкована"
                  : "Commission, % · blank is unknown/inherited",
                0,
                100,
                "0.000001",
                true,
              )}
              <Field
                name="supplierId"
                label={
                  uk
                    ? resource === "sku"
                      ? "Постачальник · порожньо — успадкувати бренд"
                      : "Постачальник бренду"
                    : "Supplier · SKU blank inherits brand"
                }
                error={fieldError("supplierId")}
              >
                <select
                  {...attrs("supplierId")}
                  value={String(values.supplierId ?? "")}
                  onChange={(e) => edit("supplierId", e.target.value || null)}
                >
                  <option value="">
                    {uk ? "Не задано / успадкувати" : "Not set / inherit"}
                  </option>
                  {data.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : resource === "supplier" ? (
            <>
              <Field
                name="name"
                label={uk ? "Назва постачальника" : "Supplier name"}
                error={fieldError("name")}
              >
                <input
                  {...attrs("name")}
                  autoComplete="off"
                  maxLength={200}
                  value={String(values.name)}
                  onChange={(e) => edit("name", e.target.value)}
                />
              </Field>
              {number(
                "leadDays",
                uk ? "Плече поставки, днів" : "Lead time, days",
                0,
                3650,
              )}
              {number(
                "coverDays",
                uk
                  ? "Покриття після поставки, днів"
                  : "Post-delivery coverage, days",
                0,
                3650,
              )}
              {number("moq", uk ? "MOQ, шт" : "MOQ, units", 1, 1000000)}
            </>
          ) : (
            <fieldset
              id="merch-seasonMonths"
              tabIndex={-1}
              aria-invalid={Boolean(fields.seasonMonths)}
              aria-describedby={
                fields.seasonMonths ? "merch-error-seasonMonths" : undefined
              }
              className="sm:col-span-2"
            >
              <legend className="text-sm text-(--muted)">
                {uk ? "Місяці сезону" : "Season months"}
              </legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <label
                    key={month}
                    className="flex items-center gap-1 text-sm text-(--text)"
                  >
                    <input
                      type="checkbox"
                      disabled={!canManage || busy}
                      checked={(values.seasonMonths as number[]).includes(
                        month,
                      )}
                      onChange={(e) =>
                        edit(
                          "seasonMonths",
                          e.target.checked
                            ? [...(values.seasonMonths as number[]), month]
                            : (values.seasonMonths as number[]).filter(
                                (m) => m !== month,
                              ),
                        )
                      }
                    />
                    {new Date(Date.UTC(2020, month - 1, 1)).toLocaleString(
                      uk ? "uk-UA" : "en-GB",
                      { month: "short", timeZone: "UTC" },
                    )}
                  </label>
                ))}
              </div>
              {fieldError("seasonMonths") && (
                <Text variant="body"
                  id="merch-error-seasonMonths"
                  className="leading-normal text-inherit mt-2 text-sm text-red-500"
                >
                  {fieldError("seasonMonths")}
                </Text>
              )}
              <Button variant="report"
                type="button"
                disabled={!canManage || busy}
                className={buttonClass + " mt-3"}
                onClick={() =>
                  edit("seasonMonths", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
                }
              >
                {uk ? "Увесь рік" : "All year"}
              </Button>
            </fieldset>
          )}
        </div>
        {canManage && (
          <Button variant="report" type="submit" className={buttonClass} disabled={busy || !dirty}>
            {busy
              ? uk
                ? "Збереження…"
                : "Saving…"
              : uk
                ? "Зберегти й застосувати"
                : "Save and apply"}
          </Button>
        )}
      </form>
      {resource === "sku" && item && (
        <PolicyPreview lang={lang} skuId={item.id} canManage={canManage} />
      )}
    </>
  );
}
