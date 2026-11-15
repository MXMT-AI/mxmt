"use client";

import {
  LayoutDashboard, Package, GitCompare, ShoppingCart, Sparkles, Building2,
  Upload, Search, Download, Plus, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button/button";
import type { PlannerSection } from "../planner-types";

const tabs = [
  { id: "dashboard", label: "Огляд", icon: LayoutDashboard },
  { id: "catalog", label: "Каталог", icon: Package },
  { id: "duplicates", label: "Дублі", icon: GitCompare },
  { id: "cart", label: "Замовлення", icon: ShoppingCart },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "brands", label: "Бренди", icon: Building2 },
] satisfies Array<{ id: PlannerSection; label: string; icon: LucideIcon }>;

const accentAction = "min-h-0 gap-2 px-3 py-1.5 bg-accent-cyan/10 border-accent-cyan/20 text-accent-cyan font-medium hover:bg-accent-cyan/20 hover:text-accent-cyan";

export function PlannerToolbar({
  section, onSectionChange, totalCartItems, totalSpent, totalBudget, fmt,
  loading, hasCartItems, onUpload, onScan, onExport, onAddBrand, exporting = false,
}: {
  section: PlannerSection;
  onSectionChange: (section: PlannerSection) => void;
  totalCartItems: number;
  totalSpent: number;
  totalBudget: number;
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
      <nav aria-label="Розділи планувальника" className="flex items-center gap-1">
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
          €{fmt(totalSpent)}{" "}
          <span className="text-(--subtle)">/ €{fmt(totalBudget)}</span>
          {totalBudget > 0 ? (
            <span className={`ml-2 ${totalSpent / totalBudget > 0.9 ? "text-accent-orange" : "text-accent-cyan"}`}>
              {Math.round((totalSpent / totalBudget) * 100)}%
            </span>
          ) : null}
        </div>
        {section === "catalog" ? (
          <Button variant="report" onClick={onUpload} className={accentAction}>
            <Upload size={13} aria-hidden="true" /> Завантажити
          </Button>
        ) : null}
        {section === "duplicates" ? (
          <Button variant="report" onClick={onScan} disabled={loading} className="min-h-0 gap-2 px-3 py-1.5 bg-white/4 text-(--text) font-medium hover:bg-white/8">
            <Search size={13} aria-hidden="true" /> {loading ? "Скануємо…" : "Сканувати"}
          </Button>
        ) : null}
        {section === "cart" && hasCartItems ? (
          <Button variant="report" onClick={onExport} disabled={exporting} className="min-h-0 gap-2 px-3 py-1.5 bg-accent-purple/10 border-accent-purple/20 text-accent-purple font-medium hover:bg-accent-purple/20 hover:text-accent-purple">
            <Download size={13} aria-hidden="true" /> {exporting ? "Готуємо Excel…" : "Експорт ЗП"}
          </Button>
        ) : null}
        {section === "brands" ? (
          <Button variant="report" onClick={onAddBrand} className={accentAction}>
            <Plus size={13} aria-hidden="true" /> Додати бренд
          </Button>
        ) : null}
      </div>
    </div>
  );
}
