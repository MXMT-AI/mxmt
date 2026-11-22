"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog/dialog";
import { Field } from "@/components/ui/field/field";
import { plannerControl, plannerField } from "../planner-form-styles";
import type { Brand } from "../planner-types";
import { usePlannerBrandMutation } from "../use-planner-brand-mutation";
import { brandMutationErrorMessage } from "./copy";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { plannerBrandModalMessages as englishCopy } from "@/messages/en.json";
import { plannerBrandModalMessages as ukrainianCopy } from "@/messages/uk.json";

export function BrandModal({ brand, onClose, onSave, onDelete }: {
  brand: Brand | null;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    name: brand?.name ?? "",
    budget: String(brand?.budget ?? 0),
    paymentDays: String(brand?.paymentDays ?? 30),
    currency: brand?.currency ?? "EUR",
    country: brand?.country ?? "",
    contact: brand?.contact ?? "",
    leadTimeDays: String(brand?.leadTimeDays ?? 28),
    moq: String(brand?.moq ?? 1),
  });
  const mutation = usePlannerBrandMutation();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleSave() {
    const body = {
      name: form.name,
      budget: parseFloat(form.budget),
      paymentDays: parseInt(form.paymentDays),
      currency: form.currency,
      country: form.country || null,
      contact: form.contact || null,
      leadTimeDays: parseInt(form.leadTimeDays),
      moq: parseInt(form.moq),
    };
    if (await mutation.save(brand?.id ?? null, body)) await onSave();
  }

  async function handleDelete() {
    if (brand && await mutation.remove(brand.id)) await onDelete(brand.id);
  }

  return (
    <Dialog title={brand ? ukrainianCopy.titleРедагуватиБренд : ukrainianCopy.titleДодатиБренд} closeLabel={ukrainianCopy.closeLabelЗакрити} onClose={onClose} closeDisabled={mutation.busy} className="max-w-md">
      <div className="p-7">
        <fieldset disabled={mutation.busy} className="space-y-3">
          <Field label={ukrainianCopy.labelНазваБренду} className={plannerField}><input type="text" value={form.name} onChange={set("name")} className={plannerControl} placeholder={englishCopy.placeholderPradaSPA} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={ukrainianCopy.labelБюджетСезону} className={plannerField}><input type="number" value={form.budget} onChange={set("budget")} className={plannerControl} /></Field>
            <Field label={ukrainianCopy.labelВалюта} className={plannerField}>
              <select value={form.currency} onChange={set("currency")} className={plannerControl}>
                {["EUR", "USD", "UAH", "GBP"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={ukrainianCopy.labelВідстрочкаДнів} className={plannerField}><input type="number" value={form.paymentDays} onChange={set("paymentDays")} className={plannerControl} /></Field>
            <Field label={ukrainianCopy.labelЛідТаймДнів} className={plannerField}><input type="number" value={form.leadTimeDays} onChange={set("leadTimeDays")} className={plannerControl} /></Field>
          </div>
          <Field label={ukrainianCopy.labelКраїна} className={plannerField}><input type="text" value={form.country} onChange={set("country")} className={plannerControl} placeholder={englishCopy.placeholderItaly} /></Field>
          <Field label={ukrainianCopy.labelКонтактнийEmail} className={plannerField}><input type="email" value={form.contact} onChange={set("contact")} className={plannerControl} placeholder={englishCopy.placeholderOrdersBrandCom} /></Field>
        </fieldset>

        {mutation.error ? <p role="alert" className="mt-3 text-sm text-red-400">{brandMutationErrorMessage(mutation.error)}</p> : null}

        <div className="flex gap-3 mt-6">
          <Button variant="accent" onClick={handleSave} disabled={mutation.busy || !form.name.trim()}
            className="flex-1">
            {mutation.operation === "save" ? ukrainianCopy.зберігаємо : ukrainianCopy.зберегти}
          </Button>
          {brand && (
            <Button variant="report" aria-label={ukrainianCopy.ariaLabelВидалитиБренд} onClick={handleDelete} disabled={mutation.busy}
              className="bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-400">
              <Trash2 aria-hidden="true" size={14} />
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
