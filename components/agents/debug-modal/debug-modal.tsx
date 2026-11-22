import DebugSection from "@/components/agents/debug-section/debug-section";
import { Badge } from "@/components/ui/badge/badge";
import { Dialog } from "@/components/ui/dialog/dialog";
import { Heading } from "@/components/ui/heading/heading";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import { agentsDebugModalMessages as englishCopy } from "@/messages/en.json";
import { agentsDebugModalMessages as ukrainianCopy } from "@/messages/uk.json";

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
  ["brandCount", ukrainianCopy.countFieldsБрендів],
  ["candidateCount", ukrainianCopy.countFieldsКандидатів],
  ["channelCount", ukrainianCopy.countFieldsКаналів],
  ["categoryCount", ukrainianCopy.countFieldsКатегорій],
  ["decisionCount", ukrainianCopy.countFieldsВалідованихРекомендацій],
  ["campaignCount", ukrainianCopy.countFieldsКампаній],
  ["calendarEventCount", ukrainianCopy.countFieldsПодій],
  ["agentsIncluded", ukrainianCopy.countFieldsАгентів],
] as const;

const traceSections = [
  { key: "systemPrompt", title: ukrainianCopy.titleСистемнийПромтРольПравила, defaultOpen: false },
  { key: "userPrompt", title: ukrainianCopy.titleДаніДляАналізуТеЩо, defaultOpen: true },
  { key: "rawResponse", title: ukrainianCopy.titleСираВідповідьAIДоПарсингу, defaultOpen: false },
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
  const providerLabel = debug.provider === "openai" ? englishCopy.providerLabelOpenAI : englishCopy.providerLabelAnthropic;
  const metadata: { label: string; value: string | number | null | undefined; color?: string }[] = [
    { label: ukrainianCopy.labelПровайдер, value: providerLabel },
    { label: ukrainianCopy.labelМодель, value: debug.model ?? "—" },
    { label: ukrainianCopy.labelПарсингJSON, value: parsedOk ? ukrainianCopy.valueFallback : englishCopy.valueFallback, color: parsedOk ? "var(--cyan-ink)" : "var(--amber-ink)" },
    { label: ukrainianCopy.labelЧасРоботи, value: duration || null },
    ...countFields.map(([key, label]) => ({ label, value: debug[key] })),
    { label: englishCopy.labelRunID, value: runId ? `${runId.slice(0, 12)}…` : null },
    { label: ukrainianCopy.labelДатаАналізу, value: debug.asOf || null, color: "var(--amber-ink)" },
    { label: ukrainianCopy.labelДаніВід, value: debug.dateFrom || null, color: "var(--violet-ink)" },
    { label: ukrainianCopy.labelЧасАналізу, value: debug.analyzedAt ? new Date(debug.analyzedAt).toLocaleTimeString("uk-UA") : null },
  ];

  return (
    <Dialog
      title={agentLabel}
      subtitle={ukrainianCopy.subtitleТрасуванняАгента}
      closeLabel={ukrainianCopy.closeLabelЗакритиТрасуванняАгента}
      onClose={onClose}
      className="max-h-[90vh] shadow-[0_24px_64px_rgba(0,0,0,.6)] backdrop:bg-black/65"
    >
      <div className="space-y-4 px-6 py-5">
        <div className="rounded-xl border border-(--border) bg-(--surface2) p-4">
          <Heading as="h3" variant="eyebrow">{ukrainianCopy.метаданіЗапуску}</Heading>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {metadata.map(({ label, value, color }) => value != null && (
              <MetricTile key={label} label={label} value={value} color={color} />
            ))}
          </dl>
        </div>

        {Array.isArray(debug.weeksAnalyzed) && debug.weeksAnalyzed.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] tracking-wide text-(--subtle) uppercase">{ukrainianCopy.тижні}</span>
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
            <Heading as="h3" variant="eyebrow" className="mb-1 text-accent-yellow">{ukrainianCopy.парсингНеВдався}</Heading>
            <p className="text-xs text-(--muted)">{ukrainianCopy.aIПовернувВідповідьАлеJSON}{debug.rawResponse && ukrainianCopy.перевіртеСируВідповідьВище}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
