import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge/badge";
import { Dialog } from "@/components/ui/dialog/dialog";
import { Heading } from "@/components/ui/heading/heading";
import { cn } from "@/lib/utils";
import { agentsInfoModalMessages as englishCopy } from "@/messages/en.json";
import { agentsInfoModalMessages as ukrainianCopy } from "@/messages/uk.json";

const dateWindows = [
  ["d7", ukrainianCopy.dateWindowsСьогодні7Днів],
  ["d14", ukrainianCopy.dateWindowsСьогодні14Днів],
  ["d30", ukrainianCopy.dateWindowsСьогодні30Днів],
] as const;

const periodFormulas = [
  [ukrainianCopy.periodFormulasШвидкість, ukrainianCopy.periodFormulasПродажіЗаПеріод],
  ["WOH", ukrainianCopy.periodFormulasЗалишокШвидкістьЗа],
  [ukrainianCopy.periodFormulasТренд, ukrainianCopy.periodFormulasДругаПоловинаПеріодуVs],
  ["STR", ukrainianCopy.periodFormulasПродажіЗаОстанні7],
] as const;

const historicalCaveats = [
  {
    tone: "positive",
    label: ukrainianCopy.labelБЛОК12,
    agents: englishCopy.agentsInventoryChannelAttributesRepricingReordering,
    description: <>{ukrainianCopy.descriptionПродажіТочніБерутьсяЗ}<strong>{ukrainianCopy.descriptionБлижнійЗнімокДоОбраноїДати}</strong>{ukrainianCopy.descriptionЯкщоЩоденніЗнімкиНе}</>,
  },
  {
    tone: "warning",
    label: ukrainianCopy.labelБЛОК3,
    agents: englishCopy.agentsCommercialMarketerCalendarAgent,
    description: <>{ukrainianCopy.descriptionЦіАгентиГенеруютьРекомендації}<strong>{ukrainianCopy.descriptionНаМайбутнє}</strong>{ukrainianCopy.descriptionЗапустиEmailСьогодніЗаплануй}<strong>{ukrainianCopy.descriptionНеActionable}</strong>{ukrainianCopy.descriptionАлеКорисніДляРетроспективи}</>,
  },
  {
    tone: "report",
    label: ukrainianCopy.labelБЛОК4,
    agents: englishCopy.agentsCampaignAnalysisWeeklyReport,
    description: <>{ukrainianCopy.descriptionЧитаютьЗбереженіРезультатиПопередніхАгентів}<strong>{ukrainianCopy.descriptionМайжеНеВпливає}</strong>{ukrainianCopy.descriptionНаЇхВивідВони}</>,
  },
] as const;

function FormulaList({ entries, className, termClassName }: {
  entries: readonly (readonly [term: string, explanation: string])[];
  className?: string;
  termClassName: string;
}) {
  return (
    <dl className={cn("space-y-1 font-mono text-[11px]", className)}>
      {entries.map(([term, explanation]) => (
        <div key={term} className="flex gap-3">
          <dt className={termClassName}>{term}</dt>
          <dd>{explanation}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title={
        <span className="flex items-center gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-cyan/10 text-accent-cyan">
            <Info size={14} aria-hidden="true" />
          </span>{ukrainianCopy.titleЯкПрацюєАналізДаних}</span>
      }
      closeLabel={ukrainianCopy.closeLabelЗакритиІнформацію}
      onClose={onClose}
      className="max-h-[88vh]"
    >
      <div className="px-6 py-5 space-y-5 text-[12px] text-(--muted) leading-relaxed">
        <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-xl p-4">
          <Heading as="h3" variant="eyebrow" className="mb-2 text-accent-cyan">{ukrainianCopy.захистВідСтарихДаних}</Heading>
          <p className="text-(--text) mb-2">{ukrainianCopy.агенти}<strong>{ukrainianCopy.автоматичноІгноруютьСтаріДані}</strong>{ukrainianCopy.наприкладДаніМинулогоРоку}</p>
          <p>{ukrainianCopy.коженАгентПриЗапускуОбраховує}</p>
          <FormulaList entries={dateWindows} className="mt-2" termClassName="text-accent-cyan" />
          <p className="mt-2">{ukrainianCopy.навітьЯкщоВБазіЄ}<strong>{ukrainianCopy.неБачить}</strong>{ukrainianCopy.боФільтр}<span className="font-mono bg-(--input-bg) px-1 rounded-sm">{englishCopy.dateD30}</span>{ukrainianCopy.відсікаєВсеСтаріше30Днів}</p>
        </div>

        <div className="bg-(--surface2) border border-(--border) rounded-xl p-4">
          <Heading as="h3" variant="eyebrow" className="mb-2">{ukrainianCopy.періодДанихВідДо}</Heading>
          <p className="mb-2">
            <strong>{ukrainianCopy.доДатаАналізу}</strong>{ukrainianCopy.агентЗапускається}<strong>{ukrainianCopy.нібиЗаразЦяДата}</strong>{ukrainianCopy.наприкладЯкщоОбрати1}</p>
          <p className="mb-2">
            <strong>{ukrainianCopy.відПочатокВікна}</strong>{ukrainianCopy.необовʼязковеЯкщоЗаповненеАгенти}<strong>{ukrainianCopy.тількиВМежахПеріодуВід}</strong>{ukrainianCopy.іРозрахунокЗмінюється}</p>
          <FormulaList entries={periodFormulas} className="mb-2" termClassName="text-accent-purple" />
          <p>{ukrainianCopy.корисноДля}</p>
          <ul className="mt-1 space-y-1 list-none pl-0">
            <li className="flex gap-2"><span className="text-accent-cyan">→</span>{ukrainianCopy.аналізуКонкретногоСезонуТількиДані}</li>
            <li className="flex gap-2"><span className="text-accent-cyan">→</span>{ukrainianCopy.ретроспективиЯкийСтанБув2}</li>
            <li className="flex gap-2"><span className="text-accent-cyan">→</span>{ukrainianCopy.перевіркиЧиПравильноАгентОцінив}</li>
          </ul>
        </div>

        <div className="border border-(--border) rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-(--surface2) border-b border-(--border)">
            <Heading as="h3" variant="eyebrow" className="mb-0">{ukrainianCopy.застереженняПриАналізіМинулихДат}</Heading>
          </div>
          <div className="divide-y divide-(--border)">
            {historicalCaveats.map(({ tone, label, agents, description }) => (
              <div key={label} className="px-4 py-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone={tone} size="small" outlined={false} className="shrink-0">{label}</Badge>
                  <span className="font-semibold text-(--text)">{agents}</span>
                </div>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-accent-purple/5 border border-accent-purple/20 rounded-xl p-4">
          <Heading as="h3" variant="eyebrow" className="mb-2 text-accent-purple">{ukrainianCopy.нюансиВласногоПеріодуВід}</Heading>
          <ul className="space-y-1.5 list-none pl-0">
            <li className="flex gap-2"><span className="text-accent-purple">·</span>{ukrainianCopy.залишкиНаСкладіЗавждиБеруться}<strong>{ukrainianCopy.до}</strong>{ukrainianCopy.найближчийЗнімокПолеВід}</li>
            <li className="flex gap-2"><span className="text-accent-purple">·</span>{ukrainianCopy.дужеКороткийПеріодМенше7}</li>
            <li className="flex gap-2"><span className="text-accent-purple">·</span>{ukrainianCopy.дужеДовгийПеріод90Днів}</li>
            <li className="flex gap-2"><span className="text-accent-purple">·</span>{ukrainianCopy.обранийПеріодЗберігаєтьсяВКожному}</li>
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
