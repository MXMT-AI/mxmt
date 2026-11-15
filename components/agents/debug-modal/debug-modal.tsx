import DebugSection from "@/components/agents/debug-section/debug-section";
import { Badge } from "@/components/ui/badge/badge";
import { Dialog } from "@/components/ui/dialog/dialog";
import { Heading } from "@/components/ui/heading/heading";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";

type DebugTrace = {
  provider?: string;
  model?: string | null;
  parsedSuccessfully?: boolean;
  brandCount?: number | null;
  candidateCount?: number | null;
  channelCount?: number | null;
  categoryCount?: number | null;
  decisionCount?: number | null;
  campaignCount?: number | null;
  calendarEventCount?: number | null;
  agentsIncluded?: number | null;
  asOf?: string | null;
  dateFrom?: string | null;
  analyzedAt?: string | null;
  weeksAnalyzed?: string[] | null;
  systemPrompt?: string | null;
  userPrompt?: string | null;
  rawResponse?: string | null;
};

const countFields = [
  ["brandCount", "Брендів"],
  ["candidateCount", "Кандидатів"],
  ["channelCount", "Каналів"],
  ["categoryCount", "Категорій"],
  ["decisionCount", "Валідованих рекомендацій"],
  ["campaignCount", "Кампаній"],
  ["calendarEventCount", "Подій"],
  ["agentsIncluded", "Агентів"],
] as const;

const traceSections = [
  { key: "systemPrompt", title: "Системний промт (роль + правила + схема JSON)", defaultOpen: false },
  { key: "userPrompt", title: "Дані для аналізу (те що відправлено в AI)", defaultOpen: true },
  { key: "rawResponse", title: "Сира відповідь AI (до парсингу JSON)", defaultOpen: false },
] as const;

export function DebugModal({
  agentLabel,
  debug,
  runId,
  duration,
  onClose,
}: {
  agentLabel: string;
  debug: DebugTrace;
  runId?: string;
  duration?: string | null;
  onClose: () => void;
}) {
  const parsedOk = debug.parsedSuccessfully !== false;
  const providerLabel = debug.provider === "openai" ? "OpenAI" : "Anthropic";
  const metadata: { label: string; value: string | number | null | undefined; color?: string }[] = [
    { label: "Провайдер", value: providerLabel },
    { label: "Модель", value: debug.model ?? "—" },
    { label: "Парсинг JSON", value: parsedOk ? "✓ успішно" : "✗ fallback", color: parsedOk ? "var(--cyan-ink)" : "var(--amber-ink)" },
    { label: "Час роботи", value: duration || null },
    ...countFields.map(([key, label]) => ({ label, value: debug[key] })),
    { label: "Run ID", value: runId ? `${runId.slice(0, 12)}…` : null },
    { label: "Дата аналізу", value: debug.asOf || null, color: "var(--amber-ink)" },
    { label: "Дані від", value: debug.dateFrom || null, color: "var(--violet-ink)" },
    { label: "Час аналізу", value: debug.analyzedAt ? new Date(debug.analyzedAt).toLocaleTimeString("uk-UA") : null },
  ];

  return (
    <Dialog
      title={agentLabel}
      subtitle="Трасування агента"
      closeLabel="Закрити трасування агента"
      onClose={onClose}
      className="max-h-[90vh] shadow-[0_24px_64px_rgba(0,0,0,.6)] backdrop:bg-black/65"
    >
      <div className="space-y-4 px-6 py-5">
        <div className="rounded-xl border border-(--border) bg-(--surface2) p-4">
          <Heading as="h3" variant="eyebrow">Метадані запуску</Heading>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {metadata.map(({ label, value, color }) => value != null && (
              <MetricTile key={label} label={label} value={value} color={color} />
            ))}
          </dl>
        </div>

        {Array.isArray(debug.weeksAnalyzed) && debug.weeksAnalyzed.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] tracking-wide text-(--subtle) uppercase">Тижні:</span>
            {debug.weeksAnalyzed.map((week) => (
              <Badge key={week} tone="warning" className="text-[9px]">{week}</Badge>
            ))}
          </div>
        )}

        {traceSections.map(({ key, title, defaultOpen }) => {
          const content = debug[key];
          return content ? <DebugSection key={key} title={title} content={content} defaultOpen={defaultOpen} /> : null;
        })}

        {!parsedOk && (
          <div className="rounded-xl border border-accent-yellow/20 bg-accent-yellow/5 p-4">
            <Heading as="h3" variant="eyebrow" className="mb-1 text-accent-yellow">Парсинг не вдався</Heading>
            <p className="text-xs text-(--muted)">
              AI повернув відповідь, але JSON не вдалося розпарсити. Використано fallback-вивід.
              {debug.rawResponse && " Перевірте сиру відповідь вище."}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
