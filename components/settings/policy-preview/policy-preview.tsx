"use client";
import { Field } from "@/components/ui/field/field";
import { Button } from "@/components/ui/button/button";
import { Text } from "@/components/ui/text/text";
import { Heading } from "@/components/ui/heading/heading";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { inputClass, buttonClass } from "../merchandising-settings-card/merchandising-settings-styles";
import { currentKyivMonth } from "../merchandising-settings-card/current-kyiv-month";

export function PolicyPreview({
  lang,
  skuId,
  canManage,
}: {
  lang: "uk" | "en";
  skuId: string;
  canManage: boolean;
}) {
  const uk = lang === "uk";
  const labels: Record<string, string> = {
    revenue: uk ? "Виручка" : "Revenue",
    cost: uk ? "Відома собівартість" : "Known cost",
    weeklyVelocity: uk
      ? "Швидкість, шт/тиж"
      : "Velocity, units/week",
    stock: uk ? "Залишок, шт" : "Stock, units",
    inTransit: uk
      ? "У дорозі · порожньо — невідомо"
      : "In transit · blank is unknown",
  };
  const [result, setResult] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [values, setValues] = useState({
    revenue: "100",
    cost: "60",
    weeklyVelocity: "7",
    stock: "10",
    inTransit: "",
  });
  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/settings/merchandising", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          skuId,
          inputs: {
            ...values,
            cost: values.cost || null,
            inTransit: values.inTransit || null,
            planMonth: currentKyivMonth(),
            month: Number(
              new Intl.DateTimeFormat("en", {
                timeZone: "Europe/Kyiv",
                month: "numeric",
              }).format(new Date()),
            ),
          },
        }),
      });
      const body = await readApiJson<Record<string, unknown>>(response);
      if (!response.ok) throw new Error("PREVIEW_FAILED");
      setResult(body);
    } catch {
      setError(
        uk
          ? "Не вдалося перевірити. Перевірте числа й повторіть спробу."
          : "Could not preview. Check the numbers and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const plan = result?.monthlyPlan as Record<string, unknown> | undefined;
  const policy = result?.policy as Record<string, unknown> | undefined,
    preview = result?.preview as Record<string, unknown> | undefined;
  return (
    <form className="mt-6 border-t border-(--border) pt-4" onSubmit={run}>
      <Heading as="h3" variant="compact" className="text-base font-medium">
        {uk ? "Перевірка збережених правил SKU" : "Check saved SKU policy"}
      </Heading>
      <Text variant="body" className="leading-normal text-inherit mt-1 text-sm text-(--muted)">
        {uk
          ? "Тестовий розрахунок на введених числах. Не змінює звітів."
          : "Test calculation using entered numbers. Does not change reports."}
      </Text>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {Object.entries(values).map(([field, value]) => (
          <Field key={field} label={labels[field]} className="gap-0 text-sm">
            <input
              className={inputClass}
              name={`preview-${field}`}
              inputMode="decimal"
              value={value}
              onChange={(e) =>
                setValues((v) => ({ ...v, [field]: e.target.value }))
              }
            />
          </Field>
        ))}
      </div>
      {canManage && (
        <Button variant="report" type="submit" className={buttonClass + " mt-3"} disabled={busy}>
          {uk ? "Перевірити на сервері" : "Check on server"}
        </Button>
      )}
      {error && (
        <Text variant="body" role="alert" className="leading-normal text-inherit mt-2 text-sm text-red-500">
          {error}
        </Text>
      )}
      {preview && policy && (
        <div
          role="status"
          className="mt-3 space-y-1 text-sm text-(--text)"
        >
          <Text variant="body" className="leading-normal text-inherit">
            {uk ? "Власність" : "Ownership"}:{" "}
            {policy.ownership === "OWN"
              ? uk
                ? "Власний сток"
                : "Own stock"
              : policy.ownership === "CONSIGNMENT"
                ? uk
                  ? "На реалізації"
                  : "Consignment"
                : uk
                  ? "Невідома"
                  : "Unknown"}
          </Text>
          <Text variant="body" className="leading-normal text-inherit">
            {uk ? "Валовий прибуток" : "Gross profit"}:{" "}
            {String(
              preview.grossProfit ?? (uk ? "Недоступний" : "Unavailable"),
            )}
          </Text>
          <Text variant="body" className="leading-normal text-inherit">
            {uk ? "Дозамовлення, шт" : "Reorder, units"}:{" "}
            {String(
              preview.orderQuantity ?? (uk ? "Недоступно" : "Unavailable"),
            )}
          </Text>
          {plan && (
            <Text variant="body" className="leading-normal text-inherit">
              {uk ? "Виконання плану, %" : "Plan attainment, %"}:{" "}
              {String(
                plan.attainmentPct ?? (uk ? "Недоступно" : "Unavailable"),
              )}
            </Text>
          )}
          <Text variant="body" className="leading-normal text-inherit">
            {uk ? "Плече / покриття / MOQ" : "Lead / cover / MOQ"}:{" "}
            {String(policy.leadDays)} / {String(policy.coverDays)} /{" "}
            {String(policy.moq)}
          </Text>
          {Boolean(preview.reorderBlocked) && (
            <Text variant="body" className="leading-normal text-inherit">
              {uk
                ? "Експорт потребує підтверджених залишків у дорозі та постачальника."
                : "Export requires confirmed in-transit stock and supplier."}
            </Text>
          )}
        </div>
      )}
    </form>
  );
}
