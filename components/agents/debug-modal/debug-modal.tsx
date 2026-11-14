import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { duration } from "@/components/agents/agents.utils";
import DebugSection from "@/components/agents/debug-section/debug-section";

export function DebugModal({
  agentLabel,
  debug,
  runId,
  duration,
  onClose,
}: {
  agentLabel: string;
  debug: Record<string, any>;
  runId?: string;
  duration?: string | null;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parsedOk = debug.parsedSuccessfully !== false;
  const providerLabel = debug.provider === "openai" ? "OpenAI" : "Anthropic";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/[0.65] backdrop-blur-sm"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="debug-modal-title"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-(--border) bg-(--surface) shadow-[0_24px_64px_rgba(0,0,0,0.6)]"
      >
        <div className="sticky top-0 bg-(--surface) border-b border-(--border) px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-0.5">
              Трасування агента
            </div>
            <h2 id="debug-modal-title" className="text-base font-bold text-(--text)">{agentLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити трасування агента"
            className="w-8 h-8 rounded-lg border border-(--border) flex items-center justify-center text-(--muted) hover:text-(--text) hover:bg-(--input-bg) transition-colors"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-(--surface2) border border-(--border) rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-3">Метадані запуску</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Провайдер", value: providerLabel },
                { label: "Модель", value: debug.model ?? "—" },
                { label: "Парсинг JSON", value: parsedOk ? "✓ успішно" : "✗ fallback", color: parsedOk ? "var(--cyan-ink)" : "var(--amber-ink)" },
                ...(duration ? [{ label: "Час роботи", value: duration }] : []),
                ...(debug.brandCount != null ? [{ label: "Брендів", value: String(debug.brandCount) }] : []),
                ...(debug.candidateCount != null ? [{ label: "Кандидатів", value: String(debug.candidateCount) }] : []),
                ...(debug.channelCount != null ? [{ label: "Каналів", value: String(debug.channelCount) }] : []),
                ...(debug.categoryCount != null ? [{ label: "Категорій", value: String(debug.categoryCount) }] : []),
                ...(debug.decisionCount != null ? [{ label: "Валідованих рекомендацій", value: String(debug.decisionCount) }] : []),
                ...(debug.campaignCount != null ? [{ label: "Кампаній", value: String(debug.campaignCount) }] : []),
                ...(debug.calendarEventCount != null ? [{ label: "Подій", value: String(debug.calendarEventCount) }] : []),
                ...(debug.agentsIncluded != null ? [{ label: "Агентів", value: String(debug.agentsIncluded) }] : []),
                ...(runId ? [{ label: "Run ID", value: runId.slice(0, 12) + "…" }] : []),
                ...(debug.asOf ? [{ label: "Дата аналізу", value: debug.asOf, color: "var(--amber-ink)" }] : []),
                ...(debug.dateFrom ? [{ label: "Дані від", value: debug.dateFrom, color: "var(--violet-ink)" }] : []),
                ...(debug.analyzedAt ? [{ label: "Час аналізу", value: new Date(debug.analyzedAt).toLocaleTimeString("uk-UA") }] : []),
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-(--row) rounded-lg px-3 py-2">
                  <div className="text-[9px] font-mono uppercase text-(--subtle)">{label}</div>
                  <div className="text-[11px] font-mono font-semibold mt-0.5" style={{ color: color ?? "var(--text)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {Array.isArray(debug.weeksAnalyzed) && debug.weeksAnalyzed.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-mono text-(--subtle) uppercase tracking-wide">Тижні:</span>
              {debug.weeksAnalyzed.map((w: string) => (
                <span key={w} className="text-[9px] font-mono px-2 py-0.5 rounded-sm bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow">{w}</span>
              ))}
            </div>
          )}

          {debug.systemPrompt && (
            <DebugSection
              title="Системний промт (роль + правила + схема JSON)"
              content={debug.systemPrompt}
              defaultOpen={false}
            />
          )}

          {debug.userPrompt && (
            <DebugSection
              title="Дані для аналізу (те що відправлено в AI)"
              content={debug.userPrompt}
              defaultOpen={true}
            />
          )}

          {debug.rawResponse && (
            <DebugSection
              title="Сирий відповідь AI (до парсингу JSON)"
              content={debug.rawResponse}
              defaultOpen={false}
            />
          )}

          {!parsedOk && (
            <div className="bg-accent-yellow/5 border border-accent-yellow/20 rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-accent-yellow mb-1">Парсинг не вдався</div>
              <p className="text-[12px] text-(--muted)">
                AI повернув відповідь, але JSON не вдалося розпарсити. Використано fallback-вивід.
                Перевірте сирий відповідь вище.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
