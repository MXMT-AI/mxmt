"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Brain, Package, FileText, Settings, LogOut, Zap, CalendarDays, Bot,
} from "lucide-react";
import { useLang, LangToggle } from "@/components/LanguageProvider";
import { ThemeToggle } from "@/components/ThemeProvider";

export default function Sidebar({ tenantName, userRole }: { tenantName: string; userRole: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLang();

  const NAV = [
    { href: "/dashboard",  label: t.nav_dashboard,  icon: LayoutDashboard },
    { href: "/agents",     label: t.nav_agents,     icon: Bot },
    { href: "/calendar",   label: t.nav_calendar,   icon: CalendarDays },
    { href: "/analyst",    label: t.nav_analyst,    icon: Brain },
    { href: "/assortment", label: t.nav_assortment, icon: Package },
    { href: "/invoices",   label: t.nav_invoices,   icon: FileText },
    { href: "/settings",   label: t.nav_settings,   icon: Settings },
  ];

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="w-56 min-h-screen bg-[var(--surface)] border-r border-[var(--border)] flex flex-col flex-shrink-0">
      {/* Brand header */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#00e5c4]/10 border border-[#00e5c4]/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[#00e5c4] font-mono text-[10px] font-bold tracking-widest">MX</span>
          </div>
          <div className="overflow-hidden">
            <div className="text-[var(--text)] text-sm font-semibold truncate leading-tight">{tenantName}</div>
            <div className="text-[var(--subtle)] text-[10px] font-mono uppercase tracking-widest">{userRole}</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-[#00e5c4]/10 text-[#00e5c4]"
                  : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)]"
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-[var(--border)] space-y-1">
        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center gap-2">
            <Zap size={12} className="text-[#fbbf24]" />
            <span className="text-[10px] font-mono text-[var(--subtle)]">Claude</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <LangToggle />
          </div>
        </div>

        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)] transition-colors"
        >
          <LogOut size={15} />
          {t.nav_logout}
        </button>
      </div>
    </div>
  );
}
