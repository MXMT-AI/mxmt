"use client";

import { Button } from "@/components/ui/button/button";
import { Note } from "@/components/ui/note/note";
import { SidebarNavItem } from "@/components/sidebar-nav-item/sidebar-nav-item";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
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
import { useLang } from "@/components/language-provider/language-provider";
import { BrandMark } from "@/components/brand-mark/brand-mark";
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
  const search = new URLSearchParams(params);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const item = ({ href, label, icon }: (typeof legacy)[number]) => (
    <SidebarNavItem key={href} href={merchandisingHref(href, search)} label={label} icon={icon} active={isActive(href)} />
  );
  const navigation = (
    <nav aria-label={copy.primary} className="space-y-1 p-2">
      {features.merchandising ? (
        <>
          {MVP.slice(0, 3).map(({ screen, icon }) =>
            item({ href: `/${screen}`, label: copy[screen], icon }),
          )}
          <Note className="px-3 pt-5 pb-1 leading-normal">
            {copy.actions}
          </Note>
          {MVP.slice(3).map(({ screen, icon }) =>
            item({ href: `/${screen}`, label: copy[screen], icon }),
          )}
        </>
      ) : null}
      {features.legacy ? (
        <details
          open={legacy.some(entry => isActive(entry.href))}
          className="pt-3"
        >
          <summary className="cursor-pointer rounded-lg px-3 py-2.5 text-xs text-(--muted) hover:text-(--text)">
            {copy.existing}
          </summary>
          <div className="mt-1 space-y-1">{legacy.map(item)}</div>
        </details>
      ) : null}
      <div className="mt-3 border-t border-(--border) pt-2">
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
    <aside className="w-full md:w-56 md:min-h-screen bg-(--surface) border-b md:border-b-0 md:border-r border-(--border) flex flex-col shrink-0">
      <div className="p-4 border-b border-(--border) flex items-center gap-3 min-w-0">
        <BrandMark />
        <div className="min-w-0">
          <div className="text-(--text) text-sm font-semibold truncate">
            {tenantName}
          </div>
          <div className="text-(--muted) text-xs truncate">{userRole}</div>
        </div>
      </div>
      <details key={pathname} className="md:hidden">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
          {copy.menu}
        </summary>
        {navigation}
      </details>
      <div className="hidden md:block flex-1">{navigation}</div>
      <div className="p-2 border-t border-(--border) flex flex-wrap md:block gap-1 items-center">
        <div className="flex flex-col px-1 py-1.5 gap-2">
          <span className="hidden md:flex items-center gap-2 text-xs text-(--muted)">
            <Zap size={12} aria-hidden="true" />
            OpenAI
          </span>
        </div>
        <Button
          variant="report"
          type="button"
          onClick={handleLogout}
          className="justify-start gap-3 border-0 px-3 py-2.5 text-(--muted)"
        >
          <LogOut size={15} aria-hidden="true" />
          {t.nav_logout}
        </Button>
      </div>
    </aside>
  );
}
