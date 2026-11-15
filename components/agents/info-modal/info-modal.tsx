import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge/badge";
import { Dialog } from "@/components/ui/dialog/dialog";
import { Heading } from "@/components/ui/heading/heading";
import { cn } from "@/lib/utils";

const dateWindows = [
  ["d7", "= сьогодні − 7 днів → продажі за тиждень"],
  ["d14", "= сьогодні − 14 днів → попередній тиждень (для тренду)"],
  ["d30", "= сьогодні − 30 днів → місячна швидкість продажів"],
] as const;

const periodFormulas = [
  ["Швидкість", "= продажі за період ÷ днів у періоді (замість ÷30)"],
  ["WOH", "= залишок ÷ швидкість за період"],
  ["Тренд", "= друга половина періоду vs перша половина"],
  ["STR", "= продажі за останні 7 днів періоду ÷ залишок"],
] as const;

const historicalCaveats = [
  {
    tone: "positive",
    label: "БЛОК 1–2",
    agents: "Inventory, Channel, Attributes, Repricing, Reordering",
    description: <>Продажі — точні (беруться з реальних записів). Залишки на складі — <strong>ближній знімок до обраної дати</strong>. Якщо щоденні знімки не зберігались — будуть використані поточні залишки.</>,
  },
  {
    tone: "warning",
    label: "БЛОК 3",
    agents: "Commercial Marketer, Calendar Agent",
    description: <>Ці агенти генерують рекомендації <strong>на майбутнє</strong>: "запусти email сьогодні", "заплануй на наступний тиждень". При аналізі минулої дати рекомендації будуть датовані тим часом — <strong>не actionable</strong>, але корисні для ретроспективи.</>,
  },
  {
    tone: "report",
    label: "БЛОК 4",
    agents: "Campaign Analysis, Weekly Report",
    description: <>Читають збережені результати попередніх агентів з бази. Обрана дата <strong>майже не впливає</strong> на їх вивід — вони завжди аналізують останні збережені дані.</>,
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
          </span>
          Як працює аналіз даних
        </span>
      }
      closeLabel="Закрити інформацію"
      onClose={onClose}
      className="max-h-[88vh]"
    >
      <div className="px-6 py-5 space-y-5 text-[12px] text-(--muted) leading-relaxed">
        <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-xl p-4">
          <Heading as="h3" variant="eyebrow" className="mb-2 text-accent-cyan">Захист від старих даних</Heading>
          <p className="text-(--text) mb-2">
            Агенти <strong>автоматично ігнорують старі дані</strong> — наприклад, дані минулого року або минулого сезону.
          </p>
          <p>
            Кожен агент при запуску обраховує вікна відносно поточного дня:
          </p>
          <FormulaList entries={dateWindows} className="mt-2" termClassName="text-accent-cyan" />
          <p className="mt-2">
            Навіть якщо в базі є записи за попередні роки — агент їх <strong>не бачить</strong>, бо фільтр <span className="font-mono bg-(--input-bg) px-1 rounded-sm">date ≥ d30</span> відсікає все старіше 30 днів. Це стандартна поведінка, коли поле «від» не заповнене.
          </p>
        </div>

        <div className="bg-(--surface2) border border-(--border) rounded-xl p-4">
          <Heading as="h3" variant="eyebrow" className="mb-2">Період даних «від — до» (поля вище)</Heading>
          <p className="mb-2">
            <strong>«До» (дата аналізу)</strong> — агент запускається <strong>ніби зараз — ця дата</strong>. Наприклад, якщо обрати 1 травня — агент вважатиме що "сьогодні" 1 травня і порахує всі вікна відносно неї.
          </p>
          <p className="mb-2">
            <strong>«Від» (початок вікна)</strong> — необовʼязкове. Якщо заповнене, агенти беруть дані <strong>тільки в межах періоду «від — до»</strong>, і розрахунок змінюється:
          </p>
          <FormulaList entries={periodFormulas} className="mb-2" termClassName="text-accent-purple" />
          <p>Корисно для:</p>
          <ul className="mt-1 space-y-1 list-none pl-0">
            <li className="flex gap-2"><span className="text-accent-cyan">→</span>Аналізу конкретного сезону: "тільки дані з 1 вересня" (старий сезон не змішується)</li>
            <li className="flex gap-2"><span className="text-accent-cyan">→</span>Ретроспективи: "який стан був 2 тижні тому?"</li>
            <li className="flex gap-2"><span className="text-accent-cyan">→</span>Перевірки: "чи правильно агент оцінив би ситуацію тоді?"</li>
          </ul>
        </div>

        <div className="border border-(--border) rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-(--surface2) border-b border-(--border)">
            <Heading as="h3" variant="eyebrow" className="mb-0">Застереження при аналізі минулих дат</Heading>
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
          <Heading as="h3" variant="eyebrow" className="mb-2 text-accent-purple">Нюанси власного періоду «від»</Heading>
          <ul className="space-y-1.5 list-none pl-0">
            <li className="flex gap-2"><span className="text-accent-purple">·</span>Залишки на складі завжди беруться на дату <strong>«до»</strong> (найближчий знімок) — поле «від» на них не впливає.</li>
            <li className="flex gap-2"><span className="text-accent-purple">·</span>Дуже короткий період (менше 7 днів) робить тренд і STR нестабільними — половини періоду занадто малі.</li>
            <li className="flex gap-2"><span className="text-accent-purple">·</span>Дуже довгий період (90+ днів) усереднює швидкість продажів — WOH може виглядати краще/гірше за реальний поточний темп.</li>
            <li className="flex gap-2"><span className="text-accent-purple">·</span>Обраний період зберігається в кожному запуску агента — його видно у вікні «Трасування» (поля asOf і dateFrom).</li>
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
