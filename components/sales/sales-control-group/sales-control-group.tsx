import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button/button";
import { button } from "@/components/ui/button/button-styles";
import { cn } from "@/lib/utils";

type SalesControlOption = { key: string; label: string } & (
  | { href: string; disabled?: false }
  | { disabled: true; title: string }
);

export function SalesControlGroup({ label, options, value }: {
  label: string;
  options: SalesControlOption[];
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-(--muted)">{label}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {options.map(option => option.disabled ? (
          <Button key={option.key} variant="report" disabled title={option.title}>
            {option.label}
          </Button>
        ) : (
          <Link
            key={option.key}
            href={option.href}
            aria-current={value === option.key ? "true" : undefined}
            className={cn(button, value === option.key && "bg-(--selection-bg) text-[#002a24] font-semibold")}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
