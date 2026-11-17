import { stockStatusColors } from "@/lib/merchandising-stock-display";
import { cn } from "@/lib/utils";

export function StockShareBar({ statuses, label, className }: {
  statuses: readonly { status: string; share: string | null }[];
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={cn("block h-2 overflow-hidden rounded-sm bg-(--input-bg)", className)}
    >
      {statuses.map(({ status, share }) => share === null || share === "0" ? null : (
        <span
          key={status}
          aria-hidden="true"
          className="inline-block h-full align-top"
          style={{ width: `${Number(share) * 100}%`, background: stockStatusColors[status] }}
        />
      ))}
    </span>
  );
}
