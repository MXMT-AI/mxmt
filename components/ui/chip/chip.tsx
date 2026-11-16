import { Button } from "../button/button";
import { cn } from "@/lib/utils";

export function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Button
      variant="report"
      aria-pressed={active}
      onClick={onClick}
      className={cn("min-h-0 px-3 py-1.5", active
        ? "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/10 hover:text-accent-cyan"
        : "bg-(--input-bg) text-(--muted) hover:border-(--subtle) hover:text-(--text)")}
    >
      {label}
    </Button>
  );
}
