"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react";
import { useLang } from "@/components/LanguageProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type Model = "SEASONAL" | "CARRYOVER" | "HYBRID" | "";

interface Answers {
  storeType: string;
  categories: string[];
  channels: string[];
  city: string;
  seasonsPerYear: string;
  ssArrival: string;
  saleStart: string;
  hitReorder: string;
  batchesPerSeason: string;
  replenishmentModel: string;
  leadTimeType: string;
  eolRisk: string;
  minMargin: string;
  currencyRisk: string;
  logisticsRestrictions: string;
}

// ─── Chip select ─────────────────────────────────────────────────────────────

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
        active
          ? "bg-[#00e5c4]/10 border-[#00e5c4]/40 text-[#00e5c4]"
          : "bg-white/[0.03] border-[var(--border)] text-[var(--muted)] hover:border-white/[0.15] hover:text-white"
      }`}>
      {label}
    </button>
  );
}

function MultiChip({ options, value, onChange }: {
  options: { v: string; l: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {options.map((o) => (
        <Chip key={o.v} label={o.l} active={value.includes(o.v)} onClick={() => toggle(o.v)} />
      ))}
    </div>
  );
}

function SingleChip({ options, value, onChange }: {
  options: { v: string; l: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {options.map((o) => (
        <Chip key={o.v} label={o.l} active={value === o.v} onClick={() => onChange(o.v)} />
      ))}
    </div>
  );
}

function Question({ num, label, hint, children }: {
  num: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4 border-b border-white/[0.05] last:border-0">
      <div className="flex gap-3">
        <span className="text-[10px] font-mono text-[var(--subtle)] pt-1 w-6 flex-shrink-0">{num}</span>
        <div className="flex-1">
          <p className="text-sm text-white font-medium">{label}</p>
          {hint && <p className="text-[11px] text-[var(--subtle)] font-mono mt-0.5">{hint}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof Answers) => (v: string | string[]) =>
    setAnswers((prev) => ({ ...prev, [k]: v }));

  const canProceed1 = model !== "";
  const canProceed2 = model === "SEASONAL"
    ? answers.seasonsPerYear !== "" && answers.hitReorder !== ""
    : model === "CARRYOVER"
    ? answers.replenishmentModel !== "" && answers.leadTimeType !== ""
    : true; // HYBRID - no required
  const canSave = answers.minMargin !== "" && answers.currencyRisk !== "";

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessModel: model, answers }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    uk ? "Модель бізнесу" : "Business model",
    uk ? "Деталі моделі" : "Model details",
    uk ? "Фінансові параметри" : "Financial",
  ];

  return (
    <div className="max-w-2xl">
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
              step > i + 1 ? "bg-[#00e5c4] text-[#0d1117]"
              : step === i + 1 ? "bg-[#00e5c4]/20 border border-[#00e5c4]/40 text-[#00e5c4]"
              : "bg-white/[0.05] border border-[var(--border)] text-[var(--subtle)]"
            }`}>
              {step > i + 1 ? <CheckCircle2 size={12} /> : i + 1}
            </div>
            <span className={`text-xs font-medium ${step === i + 1 ? "text-white" : "text-[var(--subtle)]"}`}>{s}</span>
            {i < steps.length - 1 && <ChevronRight size={14} className="text-[var(--subtle)]" />}
          </div>
        ))}
      </div>

      {/* Step 1: Business model */}
      {step === 1 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
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
            <SingleChip options={[
              { v: "mono",  l: uk ? "Монобренд" : "Monobrand" },
              { v: "multi", l: uk ? "Мультибренд" : "Multibrand" },
              { v: "own",   l: uk ? "Власне виробництво" : "Own production" },
              { v: "mix",   l: uk ? "Мікс" : "Mix" },
            ]} value={answers.storeType} onChange={set("storeType")} />
          </Question>

          <Question num="03" label={uk ? "Категорії товарів" : "Product categories"}>
            <MultiChip options={[
              { v: "clothes",    l: uk ? "Одяг" : "Clothing" },
              { v: "shoes",      l: uk ? "Взуття" : "Footwear" },
              { v: "accessories",l: uk ? "Аксесуари" : "Accessories" },
              { v: "watches",    l: uk ? "Годинники / ювелірка" : "Watches / jewelry" },
              { v: "bags",       l: uk ? "Сумки" : "Bags" },
              { v: "lifestyle",  l: uk ? "Лайфстайл" : "Lifestyle" },
            ]} value={answers.categories} onChange={(v) => set("categories")(v)} />
          </Question>

          <Question num="04" label={uk ? "Канали продажів" : "Sales channels"}>
            <MultiChip options={[
              { v: "offline",    l: uk ? "Офлайн-магазин" : "Physical store" },
              { v: "website",    l: uk ? "Власний сайт" : "Own website" },
              { v: "instagram",  l: uk ? "Instagram / TikTok" : "Instagram / TikTok" },
              { v: "marketplace",l: uk ? "Rozetka / Prom" : "Marketplace" },
            ]} value={answers.channels} onChange={(v) => set("channels")(v)} />
          </Question>

          <Question num="05" label={uk ? "Місто / регіон" : "City / region"}>
            <SingleChip options={[
              { v: "kyiv",  l: uk ? "Київ" : "Kyiv" },
              { v: "lviv",  l: uk ? "Львів" : "Lviv" },
              { v: "kharkiv",l: uk ? "Харків" : "Kharkiv" },
              { v: "odesa", l: uk ? "Одеса" : "Odesa" },
              { v: "dnipro",l: uk ? "Дніпро" : "Dnipro" },
              { v: "other", l: uk ? "Інше" : "Other" },
            ]} value={answers.city} onChange={set("city")} />
          </Question>

          <div className="mt-6 flex justify-end">
            <button onClick={() => setStep(2)} disabled={!canProceed1}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#00e5c4] hover:bg-[#00c9ab] disabled:opacity-40 text-[#0d1117] font-semibold rounded-lg text-sm transition-colors">
              {uk ? "Далі" : "Next"} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Model-specific */}
      {step === 2 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
          {(model === "SEASONAL" || model === "HYBRID") && (
            <>
              <div className="text-[9px] font-mono uppercase tracking-widest text-[#00e5c4] mb-4">
                {uk ? "🌿 Сезонна модель" : "🌿 Seasonal model"}
              </div>
              <Question num="06" label={uk ? "Скільки сезонів на рік?" : "How many seasons per year?"}>
                <SingleChip options={[
                  { v: "2",     l: uk ? "2 сезони (SS + AW)" : "2 seasons (SS + AW)" },
                  { v: "4",     l: uk ? "4 сезони" : "4 seasons" },
                  { v: "drops", l: uk ? "Безперервні дропи" : "Continuous drops" },
                ]} value={answers.seasonsPerYear} onChange={set("seasonsPerYear")} />
              </Question>
              <Question num="07" label={uk ? "Коли відкривається сейл?" : "When does sale start?"}>
                <SingleChip options={[
                  { v: "end-season",   l: uk ? "Кінець сезону" : "End of season" },
                  { v: "black-friday", l: uk ? "Чорна п'ятниця" : "Black Friday" },
                  { v: "rolling",      l: uk ? "Постійний rolling sale" : "Rolling sale" },
                ]} value={answers.saleStart} onChange={set("saleStart")} />
              </Question>
              <Question num="08" label={uk ? "Можливе дозамовлення хітів?" : "Can you reorder hits?"} hint={uk ? "Якщо «Так» — агент відстежує хіти для дозамовлення" : "If yes — agent monitors hits for reorder"}>
                <SingleChip options={[
                  { v: "yes",     l: uk ? "Так" : "Yes" },
                  { v: "no",      l: uk ? "Ні" : "No" },
                  { v: "partial", l: uk ? "Частково" : "Partially" },
                ]} value={answers.hitReorder} onChange={set("hitReorder")} />
              </Question>
            </>
          )}

          {(model === "CARRYOVER" || model === "HYBRID") && (
            <>
              {model === "HYBRID" && <hr className="border-[var(--border)] my-4" />}
              <div className="text-[9px] font-mono uppercase tracking-widest text-[#93c5fd] mb-4">
                {uk ? "♻️ Керіовер модель" : "♻️ Carryover model"}
              </div>
              <Question num="09" label={uk ? "Як відбувається поповнення запасів?" : "How is replenishment done?"}>
                <SingleChip options={[
                  { v: "rop",      l: uk ? "По мінімальному залишку (ROP)" : "By reorder point (ROP)" },
                  { v: "fixed",    l: uk ? "Фіксований графік" : "Fixed schedule" },
                  { v: "preorder", l: uk ? "Pre-order модель" : "Pre-order model" },
                ]} value={answers.replenishmentModel} onChange={set("replenishmentModel")} />
              </Question>
              <Question num="10" label={uk ? "Lead time від замовлення до отримання" : "Lead time from order to receipt"} hint={uk ? "Критично для розрахунку точки дозамовлення (ROP)" : "Critical for ROP calculation"}>
                <SingleChip options={[
                  { v: "local",        l: uk ? "До 2 тижнів (UA)" : "Up to 2 weeks (local)" },
                  { v: "turkey",       l: uk ? "2–4 тижні (Туреччина / Польща)" : "2–4 weeks (Turkey/Poland)" },
                  { v: "europe",       l: uk ? "4–6 тижнів (Італія / Європа)" : "4–6 weeks (Italy/Europe)" },
                  { v: "asia",         l: uk ? "6–10 тижнів (Азія)" : "6–10 weeks (Asia)" },
                ]} value={answers.leadTimeType} onChange={set("leadTimeType")} />
              </Question>
            </>
          )}

          <div className="mt-6 flex justify-between">
            <button onClick={() => setStep(1)} className="flex items-center gap-2 px-4 py-2 text-[var(--muted)] hover:text-white text-sm transition-colors">
              <ChevronLeft size={16} /> {uk ? "Назад" : "Back"}
            </button>
            <button onClick={() => setStep(3)} disabled={!canProceed2}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#00e5c4] hover:bg-[#00c9ab] disabled:opacity-40 text-[#0d1117] font-semibold rounded-lg text-sm transition-colors">
              {uk ? "Далі" : "Next"} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Financial */}
      {step === 3 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
          <div className="text-[9px] font-mono uppercase tracking-widest text-[#fbbf24] mb-4">
            {uk ? "💰 Фінансові параметри" : "💰 Financial parameters"}
          </div>

          <Question num="11" label={uk ? "Мінімальна прийнятна маржа на товар" : "Minimum acceptable product margin"} hint={uk ? "Агент не рекомендує уцінку нижче цього порогу без підтвердження" : "Agent won't recommend discounts below this threshold"}>
            <SingleChip options={[
              { v: "30", l: "≥ 30%" },
              { v: "40", l: "≥ 40%" },
              { v: "50", l: "≥ 50%" },
            ]} value={answers.minMargin} onChange={set("minMargin")} />
          </Question>

          <Question num="12" label={uk ? "Закупки у валюті (UAH/EUR, UAH/USD)?" : "Purchasing in foreign currency?"}>
            <SingleChip options={[
              { v: "yes", l: uk ? "Так — є валютні ризики" : "Yes — currency risks" },
              { v: "no",  l: uk ? "Ні — постачальник в гривні" : "No — supplier in UAH" },
            ]} value={answers.currencyRisk} onChange={set("currencyRisk")} />
          </Question>

          <Question num="13" label={uk ? "Наявні логістичні обмеження (воєнний стан)?" : "Any logistics restrictions (wartime)?"}>
            <SingleChip options={[
              { v: "delays", l: uk ? "Є затримки з деяких напрямків" : "Delays from some routes" },
              { v: "stable", l: uk ? "Логістика стабільна" : "Logistics stable" },
              { v: "split",  l: uk ? "Частина складу в іншому місці" : "Split warehouse" },
            ]} value={answers.logisticsRestrictions} onChange={set("logisticsRestrictions")} />
          </Question>

          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

          <div className="mt-6 flex justify-between">
            <button onClick={() => setStep(2)} className="flex items-center gap-2 px-4 py-2 text-[var(--muted)] hover:text-white text-sm transition-colors">
              <ChevronLeft size={16} /> {uk ? "Назад" : "Back"}
            </button>
            <button onClick={save} disabled={!canSave || saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#00e5c4] hover:bg-[#00c9ab] disabled:opacity-40 text-[#0d1117] font-semibold rounded-lg text-sm transition-colors">
              {saving ? (uk ? "Зберігаємо…" : "Saving…") : (uk ? "✓ Зберегти бриф" : "✓ Save brief")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
