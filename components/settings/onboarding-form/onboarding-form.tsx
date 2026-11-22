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
import { settingsOnboardingFormMessages as englishCopy } from "@/messages/en.json";
import { settingsOnboardingFormMessages as ukrainianCopy } from "@/messages/uk.json";

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
    uk ? ukrainianCopy.stepsBusinessModel : englishCopy.stepsBusinessModel,
    uk ? ukrainianCopy.stepsModelDetails : englishCopy.stepsModelDetails,
    uk ? ukrainianCopy.stepsFinancial : englishCopy.stepsFinancial,
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
          <Question num="01" label={uk ? ukrainianCopy.labelWhatIsYourAssortmentModel : englishCopy.labelWhatIsYourAssortmentModel} hint={uk ? ukrainianCopy.hintThisDefinesTheEntire : englishCopy.hintThisDefinesTheEntire}>
            <div className="flex flex-wrap gap-2 mt-2">
              {([
                { v: "SEASONAL", l: uk ? ukrainianCopy.lSeasonalCollections : englishCopy.lSeasonalCollections },
                { v: "CARRYOVER", l: uk ? ukrainianCopy.lCarryover : englishCopy.lCarryover },
                { v: "HYBRID", l: uk ? ukrainianCopy.lHybrid : englishCopy.lHybrid },
              ] as { v: Model; l: string }[]).map((o) => (
                <Chip key={o.v} label={o.l} active={model === o.v} onClick={() => setModel(o.v)} />
              ))}
            </div>
          </Question>

          <Question num="02" label={uk ? ukrainianCopy.labelStoreType : englishCopy.labelStoreType}>
            <ChipGroup options={[
              { v: "mono",  l: uk ? ukrainianCopy.lMonobrand : englishCopy.lMonobrand },
              { v: "multi", l: uk ? ukrainianCopy.lMultibrand : englishCopy.lMultibrand },
              { v: "own",   l: uk ? ukrainianCopy.lOwnProduction : englishCopy.lOwnProduction },
              { v: "mix",   l: uk ? ukrainianCopy.lMix : englishCopy.lMix },
            ]} value={answers.storeType} onChange={set("storeType")} />
          </Question>

          <Question num="03" label={uk ? ukrainianCopy.labelProductCategories : englishCopy.labelProductCategories}>
            <ChipGroup multiple options={[
              { v: "clothes",    l: uk ? ukrainianCopy.lClothing : englishCopy.lClothing },
              { v: "shoes",      l: uk ? ukrainianCopy.lFootwear : englishCopy.lFootwear },
              { v: "accessories",l: uk ? ukrainianCopy.lAccessories : englishCopy.lAccessories },
              { v: "watches",    l: uk ? ukrainianCopy.lWatchesJewelry : englishCopy.lWatchesJewelry },
              { v: "bags",       l: uk ? ukrainianCopy.lBags : englishCopy.lBags },
              { v: "lifestyle",  l: uk ? ukrainianCopy.l : englishCopy.l },
            ]} value={answers.categories} onChange={(v) => set("categories")(v)} />
          </Question>

          <Question num="04" label={uk ? ukrainianCopy.labelSalesChannels : englishCopy.labelSalesChannels}>
            <ChipGroup multiple options={[
              { v: "offline",    l: uk ? ukrainianCopy.lPhysicalStore : englishCopy.lPhysicalStore },
              { v: "website",    l: uk ? ukrainianCopy.lOwnWebsite : englishCopy.lOwnWebsite },
              { v: "instagram",  l: uk ? englishCopy.lInstagramTikTok : englishCopy.lInstagramTikTok },
              { v: "marketplace",l: uk ? englishCopy.lRozetkaProm : "Marketplace" },
            ]} value={answers.channels} onChange={(v) => set("channels")(v)} />
          </Question>

          <Question num="05" label={uk ? ukrainianCopy.labelCityRegion : englishCopy.labelCityRegion}>
            <ChipGroup options={[
              { v: "kyiv",  l: uk ? ukrainianCopy.lKyiv : englishCopy.lKyiv },
              { v: "lviv",  l: uk ? ukrainianCopy.l2 : englishCopy.l2 },
              { v: "kharkiv",l: uk ? ukrainianCopy.lKharkiv : englishCopy.lKharkiv },
              { v: "odesa", l: uk ? ukrainianCopy.lOdesa : englishCopy.lOdesa },
              { v: "dnipro",l: uk ? ukrainianCopy.lDnipro : englishCopy.lDnipro },
              { v: "other", l: uk ? ukrainianCopy.lOther : englishCopy.lOther },
            ]} value={answers.city} onChange={set("city")} />
          </Question>

        </>
      )}

      {step === 2 && (
        <>
          {(model === "SEASONAL" || model === "HYBRID") && (
            <>
              <div className="text-[9px] font-mono uppercase tracking-widest text-accent-cyan mb-4">
                {uk ? ukrainianCopy.seasonalModel : englishCopy.seasonalModel}
              </div>
              <Question num="06" label={uk ? ukrainianCopy.labelHowManySeasonsPerYear : englishCopy.labelHowManySeasonsPerYear}>
                <ChipGroup options={[
                  { v: "2",     l: uk ? ukrainianCopy.l2SeasonsSSAW : englishCopy.l2SeasonsSSAW },
                  { v: "4",     l: uk ? ukrainianCopy.l4Seasons : englishCopy.l4Seasons },
                  { v: "drops", l: uk ? ukrainianCopy.lContinuousDrops : englishCopy.lContinuousDrops },
                ]} value={answers.seasonsPerYear} onChange={set("seasonsPerYear")} />
              </Question>
              <Question num="07" label={uk ? ukrainianCopy.labelWhenDoesSaleStart : englishCopy.labelWhenDoesSaleStart}>
                <ChipGroup options={[
                  { v: "end-season",   l: uk ? ukrainianCopy.lEndOfSeason : englishCopy.lEndOfSeason },
                  { v: "black-friday", l: uk ? ukrainianCopy.lBlackFriday : englishCopy.lBlackFriday },
                  { v: "rolling",      l: uk ? ukrainianCopy.lRollingSale : englishCopy.lRollingSale },
                ]} value={answers.saleStart} onChange={set("saleStart")} />
              </Question>
              <Question num="08" label={uk ? ukrainianCopy.labelCanYouReorderHits : englishCopy.labelCanYouReorderHits} hint={uk ? ukrainianCopy.hintIfYesAgentMonitors : englishCopy.hintIfYesAgentMonitors}>
                <ChipGroup options={[
                  { v: "yes",     l: uk ? ukrainianCopy.lYes : englishCopy.lYes },
                  { v: "no",      l: uk ? ukrainianCopy.lNo : englishCopy.lNo },
                  { v: "partial", l: uk ? ukrainianCopy.lPartially : englishCopy.lPartially },
                ]} value={answers.hitReorder} onChange={set("hitReorder")} />
              </Question>
            </>
          )}

          {(model === "CARRYOVER" || model === "HYBRID") && (
            <>
              {model === "HYBRID" && <hr className="border-(--border) my-4" />}
              <div className="text-[9px] font-mono uppercase tracking-widest text-[#93c5fd] mb-4">
                {uk ? ukrainianCopy.carryoverModel : englishCopy.carryoverModel}
              </div>
              <Question num="09" label={uk ? ukrainianCopy.labelHowIsReplenishmentDone : englishCopy.labelHowIsReplenishmentDone}>
                <ChipGroup options={[
                  { v: "rop",      l: uk ? ukrainianCopy.lByReorderPointROP : englishCopy.lByReorderPointROP },
                  { v: "fixed",    l: uk ? ukrainianCopy.lFixedSchedule : englishCopy.lFixedSchedule },
                  { v: "preorder", l: uk ? ukrainianCopy.lPreOrderModel : englishCopy.lPreOrderModel },
                ]} value={answers.replenishmentModel} onChange={set("replenishmentModel")} />
              </Question>
              <Question num="10" label={uk ? ukrainianCopy.labelLeadTimeFromOrderTo : englishCopy.labelLeadTimeFromOrderTo} hint={uk ? ukrainianCopy.hintCriticalForROPCalculation : englishCopy.hintCriticalForROPCalculation}>
                <ChipGroup options={[
                  { v: "local",        l: uk ? ukrainianCopy.lUpTo2WeeksLocal : englishCopy.lUpTo2WeeksLocal },
                  { v: "turkey",       l: uk ? ukrainianCopy.l24WeeksTurkeyPoland : englishCopy.l24WeeksTurkeyPoland },
                  { v: "europe",       l: uk ? ukrainianCopy.l46WeeksItalyEurope : englishCopy.l46WeeksItalyEurope },
                  { v: "asia",         l: uk ? ukrainianCopy.l610WeeksAsia : englishCopy.l610WeeksAsia },
                ]} value={answers.leadTimeType} onChange={set("leadTimeType")} />
              </Question>
            </>
          )}

        </>
      )}

      {step === 3 && (
        <>
          <div className="text-[9px] font-mono uppercase tracking-widest text-accent-yellow mb-4">
            {uk ? ukrainianCopy.financialParameters : englishCopy.financialParameters}
          </div>

          <Question num="11" label={uk ? ukrainianCopy.labelMinimumAcceptableProductMargin : englishCopy.labelMinimumAcceptableProductMargin} hint={uk ? ukrainianCopy.hintAgentWonTRecommendDiscountsBelow : englishCopy.hintAgentWonTRecommendDiscountsBelow}>
            <ChipGroup options={[
              { v: "30", l: "≥ 30%" },
              { v: "40", l: "≥ 40%" },
              { v: "50", l: "≥ 50%" },
            ]} value={answers.minMargin} onChange={set("minMargin")} />
          </Question>

          <Question num="12" label={uk ? ukrainianCopy.labelPurchasingInForeignCurrency : englishCopy.labelPurchasingInForeignCurrency}>
            <ChipGroup options={[
              { v: "yes", l: uk ? ukrainianCopy.lYesCurrencyRisks : englishCopy.lYesCurrencyRisks },
              { v: "no",  l: uk ? ukrainianCopy.lNoSupplierInUAH : englishCopy.lNoSupplierInUAH },
            ]} value={answers.currencyRisk} onChange={set("currencyRisk")} />
          </Question>

          <Question num="13" label={uk ? ukrainianCopy.labelAnyLogisticsRestrictionsWartime : englishCopy.labelAnyLogisticsRestrictionsWartime}>
            <ChipGroup options={[
              { v: "delays", l: uk ? ukrainianCopy.lDelaysFromSomeRoutes : englishCopy.lDelaysFromSomeRoutes },
              { v: "stable", l: uk ? ukrainianCopy.l3 : englishCopy.l3 },
              { v: "split",  l: uk ? ukrainianCopy.lSplitWarehouse : englishCopy.lSplitWarehouse },
            ]} value={answers.logisticsRestrictions} onChange={set("logisticsRestrictions")} />
          </Question>

          {error && <Text variant="body" role="alert" className="mt-3 leading-normal text-red-400">{error}</Text>}

        </>
      )}
      <div className={`mt-6 flex gap-3 ${step === 1 ? "justify-end" : "justify-between"}`}>
        {step > 1 && (
          <Button variant="report" className="min-h-0 gap-2 border-0 text-(--muted) hover:bg-transparent hover:text-(--text)" onClick={() => setStep(step === 3 ? 2 : 1)}>
            <ChevronLeft size={16} aria-hidden="true" /> {uk ? ukrainianCopy.back : englishCopy.back}
          </Button>
        )}
        <Button
          variant="accent"
          className="inline-flex items-center gap-2 px-5 disabled:opacity-40"
          disabled={step === 1 ? !canProceed1 : step === 2 ? !canProceed2 : !canSave || saving}
          onClick={() => { if (step === 1) setStep(2); else if (step === 2) setStep(3); else return save(); }}
        >
          {step === 3
            ? saving ? (uk ? ukrainianCopy.saving : englishCopy.saving) : (uk ? ukrainianCopy.saveBrief : englishCopy.saveBrief)
            : <>{uk ? ukrainianCopy.next : englishCopy.next} <ChevronRight size={16} aria-hidden="true" /></>}
        </Button>
      </div>
      </div>
    </div>
  );
}
