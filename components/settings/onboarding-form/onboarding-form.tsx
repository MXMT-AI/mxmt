"use client";

import { Button } from "@/components/ui/button/button";
import { Text } from "@/components/ui/text/text";
import { panel } from "@/components/ui/panel/panel-styles";
import { Chip } from "@/components/ui/chip/chip";
import { ChipGroup } from "@/components/ui/chip-group/chip-group";
import { OnboardingQuestion as Question } from "../onboarding-question/onboarding-question";
import { useState } from "react";
import type { Model, Answers } from "./onboarding-types";
import { useOnboardingSave } from "./use-onboarding-save";
import { useRouter } from "@/i18n/navigation";

import { CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react";
import { useLang } from "@/components/language-provider/language-provider";


export default function OnboardingForm({
  existing,
}: {
  existing: { businessModel: string; answers: Record<string, unknown> } | null;
}) {
  const router = useRouter();
  const { lang } = useLang();
  const uk = lang === "uk";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [model, setModel] = useState<Model>((existing?.businessModel as Model) ?? "");
  const [answers, setAnswers] = useState<Answers>({
    storeType: "",
    categories: [],
    channels: [],
    city: "",
    seasonsPerYear: "",
    ssArrival: "",
    saleStart: "",
    hitReorder: "",
    batchesPerSeason: "",
    replenishmentModel: "",
    leadTimeType: "",
    eolRisk: "",
    minMargin: "",
    currencyRisk: "",
    logisticsRestrictions: "",
    ...(existing?.answers as Partial<Answers> ?? {}),
  });

  const set = (k: keyof Answers) => (v: string | string[]) =>
    setAnswers((prev) => ({ ...prev, [k]: v }));

  const canProceed1 = model !== "";
  const canProceed2 = model === "SEASONAL"
    ? answers.seasonsPerYear !== "" && answers.hitReorder !== ""
    : model === "CARRYOVER"
    ? answers.replenishmentModel !== "" && answers.leadTimeType !== ""
    : true;
  const canSave = answers.minMargin !== "" && answers.currencyRisk !== "";

  const { saving, error, save } = useOnboardingSave({ model, answers, enabled: canSave, onSaved: () => router.refresh() });

  const steps = [
    uk ? "Модель бізнесу" : "Business model",
    uk ? "Деталі моделі" : "Model details",
    uk ? "Фінансові параметри" : "Financial",
  ];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
              step > i + 1 ? "bg-accent-fill text-accent-fill-ink"
              : step === i + 1 ? "bg-accent-cyan/20 border border-accent-cyan/40 text-accent-cyan"
              : "bg-(--input-bg) border border-(--border) text-(--subtle)"
            }`}>
              {step > i + 1 ? <CheckCircle2 size={12} /> : i + 1}
            </div>
            <span className={`text-xs font-medium ${step === i + 1 ? "text-(--text)" : "text-(--subtle)"}`}>{s}</span>
            {i < steps.length - 1 && <ChevronRight size={14} className="text-(--subtle)" />}
          </div>
        ))}
      </div>

      <div className={panel + " p-6"}>
      {step === 1 && (
        <>
          <Question num="01" label={uk ? "Яка модель асортименту у вашому бізнесі?" : "What is your assortment model?"} hint={uk ? "⚡ Це питання визначає всю логіку роботи агента" : "⚡ This defines the entire agent logic"}>
            <div className="flex flex-wrap gap-2 mt-2">
              {([
                { v: "SEASONAL", l: uk ? "🌿 Сезонні колекції" : "🌿 Seasonal collections" },
                { v: "CARRYOVER", l: uk ? "♻️ Постійний асортимент" : "♻️ Carryover" },
                { v: "HYBRID", l: uk ? "🔀 Змішана" : "🔀 Hybrid" },
              ] as { v: Model; l: string }[]).map((o) => (
                <Chip key={o.v} label={o.l} active={model === o.v} onClick={() => setModel(o.v)} />
              ))}
            </div>
          </Question>

          <Question num="02" label={uk ? "Тип магазину" : "Store type"}>
            <ChipGroup options={[
              { v: "mono",  l: uk ? "Монобренд" : "Monobrand" },
              { v: "multi", l: uk ? "Мультибренд" : "Multibrand" },
              { v: "own",   l: uk ? "Власне виробництво" : "Own production" },
              { v: "mix",   l: uk ? "Мікс" : "Mix" },
            ]} value={answers.storeType} onChange={set("storeType")} />
          </Question>

          <Question num="03" label={uk ? "Категорії товарів" : "Product categories"}>
            <ChipGroup multiple options={[
              { v: "clothes",    l: uk ? "Одяг" : "Clothing" },
              { v: "shoes",      l: uk ? "Взуття" : "Footwear" },
              { v: "accessories",l: uk ? "Аксесуари" : "Accessories" },
              { v: "watches",    l: uk ? "Годинники / ювелірка" : "Watches / jewelry" },
              { v: "bags",       l: uk ? "Сумки" : "Bags" },
              { v: "lifestyle",  l: uk ? "Лайфстайл" : "Lifestyle" },
            ]} value={answers.categories} onChange={(v) => set("categories")(v)} />
          </Question>

          <Question num="04" label={uk ? "Канали продажів" : "Sales channels"}>
            <ChipGroup multiple options={[
              { v: "offline",    l: uk ? "Офлайн-магазин" : "Physical store" },
              { v: "website",    l: uk ? "Власний сайт" : "Own website" },
              { v: "instagram",  l: uk ? "Instagram / TikTok" : "Instagram / TikTok" },
              { v: "marketplace",l: uk ? "Rozetka / Prom" : "Marketplace" },
            ]} value={answers.channels} onChange={(v) => set("channels")(v)} />
          </Question>

          <Question num="05" label={uk ? "Місто / регіон" : "City / region"}>
            <ChipGroup options={[
              { v: "kyiv",  l: uk ? "Київ" : "Kyiv" },
              { v: "lviv",  l: uk ? "Львів" : "Lviv" },
              { v: "kharkiv",l: uk ? "Харків" : "Kharkiv" },
              { v: "odesa", l: uk ? "Одеса" : "Odesa" },
              { v: "dnipro",l: uk ? "Дніпро" : "Dnipro" },
              { v: "other", l: uk ? "Інше" : "Other" },
            ]} value={answers.city} onChange={set("city")} />
          </Question>

        </>
      )}

      {step === 2 && (
        <>
          {(model === "SEASONAL" || model === "HYBRID") && (
            <>
              <div className="text-[9px] font-mono uppercase tracking-widest text-accent-cyan mb-4">
                {uk ? "🌿 Сезонна модель" : "🌿 Seasonal model"}
              </div>
              <Question num="06" label={uk ? "Скільки сезонів на рік?" : "How many seasons per year?"}>
                <ChipGroup options={[
                  { v: "2",     l: uk ? "2 сезони (SS + AW)" : "2 seasons (SS + AW)" },
                  { v: "4",     l: uk ? "4 сезони" : "4 seasons" },
                  { v: "drops", l: uk ? "Безперервні дропи" : "Continuous drops" },
                ]} value={answers.seasonsPerYear} onChange={set("seasonsPerYear")} />
              </Question>
              <Question num="07" label={uk ? "Коли відкривається сейл?" : "When does sale start?"}>
                <ChipGroup options={[
                  { v: "end-season",   l: uk ? "Кінець сезону" : "End of season" },
                  { v: "black-friday", l: uk ? "Чорна п'ятниця" : "Black Friday" },
                  { v: "rolling",      l: uk ? "Постійний rolling sale" : "Rolling sale" },
                ]} value={answers.saleStart} onChange={set("saleStart")} />
              </Question>
              <Question num="08" label={uk ? "Можливе дозамовлення хітів?" : "Can you reorder hits?"} hint={uk ? "Якщо «Так» — агент відстежує хіти для дозамовлення" : "If yes — agent monitors hits for reorder"}>
                <ChipGroup options={[
                  { v: "yes",     l: uk ? "Так" : "Yes" },
                  { v: "no",      l: uk ? "Ні" : "No" },
                  { v: "partial", l: uk ? "Частково" : "Partially" },
                ]} value={answers.hitReorder} onChange={set("hitReorder")} />
              </Question>
            </>
          )}

          {(model === "CARRYOVER" || model === "HYBRID") && (
            <>
              {model === "HYBRID" && <hr className="border-(--border) my-4" />}
              <div className="text-[9px] font-mono uppercase tracking-widest text-[#93c5fd] mb-4">
                {uk ? "♻️ Керіовер модель" : "♻️ Carryover model"}
              </div>
              <Question num="09" label={uk ? "Як відбувається поповнення запасів?" : "How is replenishment done?"}>
                <ChipGroup options={[
                  { v: "rop",      l: uk ? "По мінімальному залишку (ROP)" : "By reorder point (ROP)" },
                  { v: "fixed",    l: uk ? "Фіксований графік" : "Fixed schedule" },
                  { v: "preorder", l: uk ? "Pre-order модель" : "Pre-order model" },
                ]} value={answers.replenishmentModel} onChange={set("replenishmentModel")} />
              </Question>
              <Question num="10" label={uk ? "Lead time від замовлення до отримання" : "Lead time from order to receipt"} hint={uk ? "Критично для розрахунку точки дозамовлення (ROP)" : "Critical for ROP calculation"}>
                <ChipGroup options={[
                  { v: "local",        l: uk ? "До 2 тижнів (UA)" : "Up to 2 weeks (local)" },
                  { v: "turkey",       l: uk ? "2–4 тижні (Туреччина / Польща)" : "2–4 weeks (Turkey/Poland)" },
                  { v: "europe",       l: uk ? "4–6 тижнів (Італія / Європа)" : "4–6 weeks (Italy/Europe)" },
                  { v: "asia",         l: uk ? "6–10 тижнів (Азія)" : "6–10 weeks (Asia)" },
                ]} value={answers.leadTimeType} onChange={set("leadTimeType")} />
              </Question>
            </>
          )}

        </>
      )}

      {step === 3 && (
        <>
          <div className="text-[9px] font-mono uppercase tracking-widest text-accent-yellow mb-4">
            {uk ? "💰 Фінансові параметри" : "💰 Financial parameters"}
          </div>

          <Question num="11" label={uk ? "Мінімальна прийнятна маржа на товар" : "Minimum acceptable product margin"} hint={uk ? "Агент не рекомендує уцінку нижче цього порогу без підтвердження" : "Agent won't recommend discounts below this threshold"}>
            <ChipGroup options={[
              { v: "30", l: "≥ 30%" },
              { v: "40", l: "≥ 40%" },
              { v: "50", l: "≥ 50%" },
            ]} value={answers.minMargin} onChange={set("minMargin")} />
          </Question>

          <Question num="12" label={uk ? "Закупки у валюті (UAH/EUR, UAH/USD)?" : "Purchasing in foreign currency?"}>
            <ChipGroup options={[
              { v: "yes", l: uk ? "Так — є валютні ризики" : "Yes — currency risks" },
              { v: "no",  l: uk ? "Ні — постачальник в гривні" : "No — supplier in UAH" },
            ]} value={answers.currencyRisk} onChange={set("currencyRisk")} />
          </Question>

          <Question num="13" label={uk ? "Наявні логістичні обмеження (воєнний стан)?" : "Any logistics restrictions (wartime)?"}>
            <ChipGroup options={[
              { v: "delays", l: uk ? "Є затримки з деяких напрямків" : "Delays from some routes" },
              { v: "stable", l: uk ? "Логістика стабільна" : "Logistics stable" },
              { v: "split",  l: uk ? "Частина складу в іншому місці" : "Split warehouse" },
            ]} value={answers.logisticsRestrictions} onChange={set("logisticsRestrictions")} />
          </Question>

          {error && <Text variant="body" role="alert" className="mt-3 leading-normal text-red-400">{error}</Text>}

        </>
      )}
      <div className={`mt-6 flex gap-3 ${step === 1 ? "justify-end" : "justify-between"}`}>
        {step > 1 && (
          <Button variant="report" className="min-h-0 gap-2 border-0 text-(--muted) hover:bg-transparent hover:text-(--text)" onClick={() => setStep(step === 3 ? 2 : 1)}>
            <ChevronLeft size={16} aria-hidden="true" /> {uk ? "Назад" : "Back"}
          </Button>
        )}
        <Button
          variant="accent"
          className="inline-flex items-center gap-2 px-5 disabled:opacity-40"
          disabled={step === 1 ? !canProceed1 : step === 2 ? !canProceed2 : !canSave || saving}
          onClick={() => { if (step === 1) setStep(2); else if (step === 2) setStep(3); else return save(); }}
        >
          {step === 3
            ? saving ? (uk ? "Зберігаємо…" : "Saving…") : (uk ? "✓ Зберегти бриф" : "✓ Save brief")
            : <>{uk ? "Далі" : "Next"} <ChevronRight size={16} aria-hidden="true" /></>}
        </Button>
      </div>
      </div>
    </div>
  );
}
