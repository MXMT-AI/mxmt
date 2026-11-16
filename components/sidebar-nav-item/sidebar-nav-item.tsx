import type { LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SidebarNavItem({ href, label, icon: Icon, active }: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn(
      "flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
      active ? "bg-(--nav-current) text-(--nav-ink)" : "text-(--muted) hover:bg-(--input-bg) hover:text-(--text)",
    )}>
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
