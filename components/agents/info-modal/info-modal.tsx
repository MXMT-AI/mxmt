import { useEffect, useRef } from "react";
import { X, Info } from "lucide-react";

export function InfoModal({ onClose }: { onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-modal-title"
        className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-(--border) bg-(--surface) shadow-[0_24px_64px_rgba(0,0,0,.5)]"
      >
        <div className="sticky top-0 bg-(--surface) border-b border-(--border) px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-accent-cyan/10 flex items-center justify-center">
              <Info size={14} className="text-accent-cyan" aria-hidden="true" />
            </div>
            <h2 id="info-modal-title" className="text-base font-bold text-(--text)">Як працює аналіз даних</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити інформацію"
            className="w-8 h-8 rounded-lg border border-(--border) flex items-center justify-center text-(--muted) hover:text-(--text) hover:bg-(--input-bg) transition-colors"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 text-[12px] text-(--muted) leading-relaxed">

          <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-accent-cyan mb-2">Захист від старих даних</div>
            <p className="text-(--text) mb-2">
              Агенти <strong>автоматично ігнорують старі дані</strong> — наприклад, дані минулого року або минулого сезону.
            </p>
            <p>
              Кожен агент при запуску обраховує вікна відносно поточного дня:
            </p>
            <div className="mt-2 space-y-1 font-mono text-[11px]">
              <div className="flex gap-3"><span className="text-accent-cyan">d7</span><span>= сьогодні − 7 днів → продажі за тиждень</span></div>
              <div className="flex gap-3"><span className="text-accent-cyan">d14</span><span>= сьогодні − 14 днів → попередній тиждень (для тренду)</span></div>
              <div className="flex gap-3"><span className="text-accent-cyan">d30</span><span>= сьогодні − 30 днів → місячна швидкість продажів</span></div>
            </div>
            <p className="mt-2">
              Навіть якщо в базі є записи за попередні роки — агент їх <strong>не бачить</strong>, бо фільтр <span className="font-mono bg-(--input-bg) px-1 rounded-sm">date ≥ d30</span> відсікає все старіше 30 днів. Це стандартна поведінка, коли поле «від» не заповнене.
            </p>
          </div>

          <div className="bg-(--surface2) border border-(--border) rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">Період даних «від — до» (поля вище)</div>
            <p className="mb-2">
              <strong>«До» (дата аналізу)</strong> — агент запускається <strong>ніби зараз — ця дата</strong>. Наприклад, якщо обрати 1 травня — агент вважатиме що "сьогодні" 1 травня і порахує всі вікна відносно неї.
            </p>
            <p className="mb-2">
              <strong>«Від» (початок вікна)</strong> — необовʼязкове. Якщо заповнене, агенти беруть дані <strong>тільки в межах періоду «від — до»</strong>, і розрахунок змінюється:
            </p>
            <div className="mb-2 space-y-1 font-mono text-[11px]">
              <div className="flex gap-3"><span className="text-accent-purple">Швидкість</span><span>= продажі за період ÷ днів у періоді (замість ÷30)</span></div>
              <div className="flex gap-3"><span className="text-accent-purple">WOH</span><span>= залишок ÷ швидкість за період</span></div>
              <div className="flex gap-3"><span className="text-accent-purple">Тренд</span><span>= друга половина періоду vs перша половина</span></div>
              <div className="flex gap-3"><span className="text-accent-purple">STR</span><span>= продажі за останні 7 днів періоду ÷ залишок</span></div>
            </div>
            <p>Корисно для:</p>
            <ul className="mt-1 space-y-1 list-none pl-0">
              <li className="flex gap-2"><span className="text-accent-cyan">→</span>Аналізу конкретного сезону: "тільки дані з 1 вересня" (старий сезон не змішується)</li>
              <li className="flex gap-2"><span className="text-accent-cyan">→</span>Ретроспективи: "який стан був 2 тижні тому?"</li>
              <li className="flex gap-2"><span className="text-accent-cyan">→</span>Перевірки: "чи правильно агент оцінив би ситуацію тоді?"</li>
            </ul>
          </div>

          <div className="border border-(--border) rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-(--surface2) border-b border-(--border)">
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle)">Застереження при аналізі минулих дат</div>
            </div>
            <div className="divide-y divide-(--border)">
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-cyan/10 text-accent-cyan">БЛОК 1–2</span>
                  <span className="text-(--text) font-semibold">Inventory, Channel, Attributes, Repricing, Reordering</span>
                </div>
                <p>Продажі — точні (беруться з реальних записів). Залишки на складі — <strong>ближній знімок до обраної дати</strong>. Якщо щоденні знімки не зберігались — будуть використані поточні залишки.</p>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-yellow/10 text-accent-yellow">БЛОК 3</span>
                  <span className="text-(--text) font-semibold">Commercial Marketer, Calendar Agent</span>
                </div>
                <p>Ці агенти генерують рекомендації <strong>на майбутнє</strong>: "запусти email сьогодні", "заплануй на наступний тиждень". При аналізі минулої дати рекомендації будуть датовані тим часом — <strong>не actionable</strong>, але корисні для ретроспективи.</p>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-report/10 text-accent-report">БЛОК 4</span>
                  <span className="text-(--text) font-semibold">Campaign Analysis, Weekly Report</span>
                </div>
                <p>Читають збережені результати попередніх агентів з бази. Обрана дата <strong>майже не впливає</strong> на їх вивід — вони завжди аналізують останні збережені дані.</p>
              </div>
            </div>
          </div>

          <div className="bg-accent-purple/5 border border-accent-purple/20 rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-accent-purple mb-2">Нюанси власного періоду «від»</div>
            <ul className="space-y-1.5 list-none pl-0">
              <li className="flex gap-2"><span className="text-accent-purple">·</span>Залишки на складі завжди беруться на дату <strong>«до»</strong> (найближчий знімок) — поле «від» на них не впливає.</li>
              <li className="flex gap-2"><span className="text-accent-purple">·</span>Дуже короткий період (менше 7 днів) робить тренд і STR нестабільними — половини періоду занадто малі.</li>
              <li className="flex gap-2"><span className="text-accent-purple">·</span>Дуже довгий період (90+ днів) усереднює швидкість продажів — WOH може виглядати краще/гірше за реальний поточний темп.</li>
              <li className="flex gap-2"><span className="text-accent-purple">·</span>Обраний період зберігається в кожному запуску агента — його видно у вікні «Трасування» (поля asOf і dateFrom).</li>
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}
