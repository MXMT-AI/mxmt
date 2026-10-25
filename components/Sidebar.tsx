"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Brain,
  Package,
  Settings,
  LogOut,
  Zap,
  CalendarDays,
  Bot,
  Database,
  BarChart3,
  Warehouse,
  Tags,
  ShoppingCart,
} from "lucide-react";
import { useLang, LangToggle } from "@/components/LanguageProvider";
import { ThemeToggle } from "@/components/ThemeProvider";
import { merchandisingCopy } from "@/lib/merchandising-copy";
import {
  merchandisingHref,
  type MvpScreen,
} from "@/lib/merchandising-navigation";

const MVP = [
  { screen: "overview", icon: LayoutDashboard },
  { screen: "sales", icon: BarChart3 },
  { screen: "stock", icon: Warehouse },
  { screen: "repricing", icon: Tags },
  { screen: "reordering", icon: ShoppingCart },
] satisfies Array<{ screen: MvpScreen; icon: typeof LayoutDashboard }>;

export default function Sidebar({
  tenantName,
  userRole,
  features = { merchandising: true, legacy: true },
}: {
  tenantName: string;
  userRole: string;
  features?: { merchandising: boolean; legacy: boolean };
}) {
  const pathname = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const { t, lang } = useLang(),
    copy = merchandisingCopy[lang];
  const legacy = [
    { href: "/dashboard", label: t.nav_dashboard, icon: LayoutDashboard },
    { href: "/agents", label: t.nav_agents, icon: Bot },
    { href: "/calendar", label: t.nav_calendar, icon: CalendarDays },
    { href: "/analyst", label: t.nav_analyst, icon: Brain },
    { href: "/assortment", label: t.nav_assortment, icon: Package },
    { href: "/data-reporting", label: t.nav_data_reporting, icon: Database },
  ];
  const item = ({ href, label, icon: Icon }: (typeof legacy)[number]) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        key={href}
        href={merchandisingHref(href, new URLSearchParams(params))}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 px-3 py-2.5 min-h-11 rounded-lg text-sm font-medium transition-colors touch-manipulation ${active ? "bg-[var(--input-hover)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)]"}`}
      >
        <Icon size={16} aria-hidden="true" />
        <span>{label}</span>
      </Link>
    );
  };
  const navigation = (
    <nav aria-label={copy.primary} className="space-y-1 p-2">
      {features.merchandising ? (
        <>
          {MVP.slice(0, 3).map(({ screen, icon }) =>
            item({ href: `/${screen}`, label: copy[screen], icon }),
          )}
          <p className="px-3 pt-5 pb-1 text-xs text-[var(--muted)]">
            {copy.actions}
          </p>
          {MVP.slice(3).map(({ screen, icon }) =>
            item({ href: `/${screen}`, label: copy[screen], icon }),
          )}
        </>
      ) : null}
      {features.legacy ? (
        <details
          open={legacy.some((entry) => pathname === entry.href)}
          className="pt-3"
        >
          <summary className="cursor-pointer rounded-lg px-3 py-2.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
            {copy.existing}
          </summary>
          <div className="mt-1 space-y-1">{legacy.map(item)}</div>
        </details>
      ) : null}
      <div className="mt-3 border-t border-[var(--border)] pt-2">
        {item({ href: "/settings", label: t.nav_settings, icon: Settings })}
      </div>
    </nav>
  );
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <aside className="w-full md:w-56 md:min-h-screen bg-[var(--surface)] border-b md:border-b-0 md:border-r border-[var(--border)] flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-[var(--border)] flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-[var(--input-bg)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
          <span className="text-[var(--accent)] text-xs font-bold">MX</span>
        </div>
        <div className="min-w-0">
          <div className="text-[var(--text)] text-sm font-semibold truncate">
            {tenantName}
          </div>
          <div className="text-[var(--muted)] text-xs truncate">{userRole}</div>
        </div>
      </div>
      <details className="md:hidden">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
          {copy.menu}
        </summary>
        {navigation}
      </details>
      <div className="hidden md:block flex-1">{navigation}</div>
      <div className="p-2 border-t border-[var(--border)] flex flex-wrap md:block gap-1 items-center">
        <div className="flex items-center justify-between px-3 py-1.5 gap-3">
          <span className="hidden md:flex items-center gap-2 text-xs text-[var(--muted)]">
            <Zap size={12} aria-hidden="true" />
            OpenAI
          </span>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <LangToggle />
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 min-h-11 rounded-lg text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)] touch-manipulation"
        >
          <LogOut size={15} aria-hidden="true" />
          {t.nav_logout}
        </button>
      </div>
    </aside>
  );
}
