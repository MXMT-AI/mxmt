import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { Text } from "@/components/ui/text/text";
import { cn } from "@/lib/utils";

type ReportTableStateProps = { message: string } & (
  | { state: "loading" | "empty" }
  | { state: "error"; retryLabel: string; onRetry: () => void }
);

const styles = {
  loading: "flex-col gap-3 text-sm text-(--muted)",
  error: "flex-col gap-3 px-5 text-center",
  empty: "px-5 text-sm text-(--muted) text-center",
};

export function ReportTableState(props: ReportTableStateProps) {
  return (
    <div role={props.state === "error" ? "alert" : props.state === "loading" ? "status" : undefined}
      className={cn("h-80 flex items-center justify-center", styles[props.state])}>
      {props.state === "loading" ? (
        <>
          <LoaderCircle size={22} className="motion-safe:animate-spin text-accent-cyan" aria-hidden="true" />
          {props.message}
        </>
      ) : props.state === "error" ? (
        <>
          <AlertTriangle size={24} className="text-accent-yellow" aria-hidden="true" />
          <Text variant="body" className="max-w-xl leading-5 text-(--muted)">{props.message}</Text>
          <Button onClick={props.onRetry} className="px-3 py-2 font-sans text-xs text-(--text) hover:bg-(--input-hover)">
            {props.retryLabel}
          </Button>
        </>
      ) : props.message}
    </div>
  );
}
