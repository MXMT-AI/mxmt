"use client";

import {
  LayoutDashboard, Package, GitCompare, ShoppingCart, Sparkles, Building2,
  Upload, Search, Download, Plus, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { plannerAmount } from "../planner-money";
import type { PlannerSection } from "../planner-types";
import { plannerPlannerToolbarMessages as ukrainianCopy } from "@/messages/uk.json";

const tabs = [
  { id: "dashboard", label: ukrainianCopy.labelОгляд, icon: LayoutDashboard },
  { id: "catalog", label: ukrainianCopy.labelКаталог, icon: Package },
  { id: "duplicates", label: ukrainianCopy.labelДублі, icon: GitCompare },
  { id: "cart", label: ukrainianCopy.labelЗамовлення, icon: ShoppingCart },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "brands", label: ukrainianCopy.labelБренди, icon: Building2 },
] satisfies Array<{ id: PlannerSection; label: string; icon: LucideIcon }>;

const actionClassName = "min-h-0 gap-2 px-3 py-1.5 font-medium";

export function PlannerToolbar({
  section, onSectionChange, totalCartItems, totalSpent, totalBudget, fmt, currency = "EUR",
  loading, hasCartItems, onUpload, onScan, onExport, onAddBrand, exporting = false,
}: {
  section: PlannerSection;
  onSectionChange: (section: PlannerSection) => void;
  totalCartItems: number;
  totalSpent: number;
  totalBudget: number;
  currency?: string | null;
  fmt: (value: number) => string;
  loading: boolean;
  hasCartItems: boolean;
  exporting?: boolean;
  onUpload: () => void;
  onScan: () => void;
  onExport: () => void;
  onAddBrand: () => void;
}) {
  return (
    <div className="bg-(--surface) border-b border-(--border) px-6 flex items-center justify-between h-13 shrink-0">
      <nav aria-label={ukrainianCopy.ariaLabelРозділиПланувальника} className="flex items-center gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="report"
            aria-pressed={section === id}
            onClick={() => onSectionChange(id)}
            className="min-h-0 gap-2 border-0 px-3 py-2 font-medium text-(--muted) hover:text-(--text) hover:bg-white/4 aria-pressed:bg-accent-cyan/10 aria-pressed:text-accent-cyan"
          >
            <Icon size={14} aria-hidden="true" />
            {label}{id === "cart" ? ` (${totalCartItems})` : ""}
          </Button>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <div className="text-xs font-mono text-(--muted) bg-white/3 border border-(--border) px-3 py-1.5 rounded-lg">
          {plannerAmount(totalSpent, currency, fmt)}{" "}
          <span className="text-(--subtle)">/ {plannerAmount(totalBudget, currency, fmt)}</span>
          {currency && totalBudget > 0 ? (
            <span className={`ml-2 ${totalSpent / totalBudget > 0.9 ? "text-accent-orange" : "text-accent-cyan"}`}>
              {Math.round((totalSpent / totalBudget) * 100)}%
            </span>
          ) : null}
        </div>
        {section === "catalog" ? (
          <Button variant="report" tone="positive" onClick={onUpload} className={actionClassName}>
            <Upload size={13} aria-hidden="true" />{ukrainianCopy.завантажити}</Button>
        ) : null}
        {section === "duplicates" ? (
          <Button variant="report" onClick={onScan} disabled={loading} className="min-h-0 gap-2 px-3 py-1.5 bg-white/4 text-(--text) font-medium hover:bg-white/8">
            <Search size={13} aria-hidden="true" /> {loading ? ukrainianCopy.скануємо : ukrainianCopy.сканувати}
          </Button>
        ) : null}
        {section === "cart" && hasCartItems ? (
          <Button variant="report" tone="accent" onClick={onExport} disabled={exporting} className={actionClassName}>
            <Download size={13} aria-hidden="true" /> {exporting ? ukrainianCopy.готуємоExcel : ukrainianCopy.експортЗП}
          </Button>
        ) : null}
        {section === "brands" ? (
          <Button variant="report" tone="positive" onClick={onAddBrand} className={actionClassName}>
            <Plus size={13} aria-hidden="true" />{ukrainianCopy.додатиБренд}</Button>
        ) : null}
      </div>
    </div>
  );
}
