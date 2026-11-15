import { CheckCircle2, LoaderCircle } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge/badge";

export function reportStatusTone(status: string | null | undefined): BadgeTone {
  if (status === "SUCCESS") return "positive";
  if (status === "WARNING") return "warning";
  if (status === "RUNNING" || status === "PENDING") return "accent";
  return "neutral";
}

export function ReportStatusCard({ label, value, detail, status, loading }: {
  label: string;
  value: string;
  detail: string;
  status?: string | null;
  loading: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-(--border) bg-(--surface) p-4">
      <p className="mb-2 font-mono text-[10px] tracking-widest text-(--subtle) uppercase">{label}</p>
      {loading ? (
        <div className="flex h-8 items-center">
          <LoaderCircle size={15} className="motion-safe:animate-spin text-(--muted)" aria-hidden="true" />
        </div>
      ) : (
        <>
          <p className="truncate text-sm font-medium text-(--text)" title={value}>{value}</p>
          <Badge tone={reportStatusTone(status)} outlined={Boolean(status)} className="mt-2 inline-flex items-center gap-1 rounded-md">
            {detail === "SUCCESS" && <CheckCircle2 size={10} aria-hidden="true" />}
            {detail}
          </Badge>
        </>
      )}
    </div>
  );
}
