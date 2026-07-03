"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard, Package, GitCompare, ShoppingCart,
  Sparkles, Building2, Upload, Download, Plus, X,
  Trash2, Search, RefreshCw, AlertTriangle,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useLang } from "@/components/LanguageProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Brand {
  id: string;
  name: string;
  budget: number;
  paymentDays: number;
  currency: string;
  country: string | null;
  contact: string | null;
  leadTimeDays: number;
  moq: number;
}

interface CatalogUpload {
  id: string;
  brandId: string;
  season: string;
  fileName: string | null;
  itemCount: number;
  uploadedAt: string;
  brand: { name: string };
}

interface CatalogItem {
  id: string;
  catalogId: string;
  brandId: string;
  sku: string;
  name: string;
  category: string;
  color: string | null;
  style: string | null;
  material: string | null;
  priceWholesale: number;
  priceRetail: number | null;
  minOrder: number;
  stockAvail: number;
  leadTimeDays: number;
  tags: string[];
  brand: { id: string; name: string; currency: string };
}

interface CartItem {
  catalogItemId: string;
  sku: string;
  name: string;
  brandId: string;
  brandName: string;
  category: string;
  price: number;
  currency: string;
  qty: number;
  minOrder: number;
}

type Section = "dashboard" | "catalog" | "duplicates" | "cart" | "ai" | "brands";

interface AiMessage { role: "user" | "assistant"; content: string }

// ─── PlannerApp ───────────────────────────────────────────────────────────────

export default function PlannerApp({
  initialBrands,
  initialCatalogs,
  initialCart,
}: {
  initialBrands: Brand[];
  initialCatalogs: CatalogUpload[];
  initialCart: object[];
}) {
  const [section, setSection] = useState<Section>("dashboard");
  const [brands, setBrands] = useState<Brand[]>(initialBrands);
  const [catalogs, setCatalogs] = useState<CatalogUpload[]>(initialCatalogs);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>(initialCart as CartItem[]);
  const [duplicates, setDuplicates] = useState<CatalogItem[][]>([]);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Filters for catalog view
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");

  // Modals
  const [uploadModal, setUploadModal] = useState(false);
  const [brandModal, setBrandModal] = useState<Brand | null | "new">(null);

  // ─── Budget computed ────────────────────────────────────────────────────────
  const budgetStatus = brands.map((b) => {
    const spent = cart.filter((c) => c.brandId === b.id).reduce((s, c) => s + c.price * c.qty, 0);
    const budget = b.budget ?? 0;
    return { ...b, spent, remaining: budget - spent, pct: budget > 0 ? Math.round((spent / budget) * 100) : 0 };
  });
  const totalBudget = budgetStatus.reduce((s, b) => s + b.budget, 0);
  const totalSpent = budgetStatus.reduce((s, b) => s + b.spent, 0);
  const totalCartItems = cart.reduce((s, c) => s + c.qty, 0);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fmt = (n: number) =>
    Number(n || 0).toLocaleString("uk-UA", { maximumFractionDigits: 0 });

  // ─── Load items ─────────────────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        brandId: filterBrand,
        category: filterCategory,
        search: filterSearch,
      });
      const res = await fetch(`/api/planner/items?${params}`);
      const data = await res.json();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [filterBrand, filterCategory, filterSearch]);

  useEffect(() => {
    if (section === "catalog") loadItems();
  }, [section, loadItems]);

  // ─── Cart persistence ───────────────────────────────────────────────────────
  const saveCartRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveCart = useCallback((newCart: CartItem[]) => {
    clearTimeout(saveCartRef.current);
    saveCartRef.current = setTimeout(async () => {
      await fetch("/api/planner/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: newCart }),
      });
    }, 600);
  }, []);

  const updateCart = useCallback((newCart: CartItem[]) => {
    setCart(newCart);
    saveCart(newCart);
  }, [saveCart]);

  // ─── Cart operations ────────────────────────────────────────────────────────
  const addToCart = useCallback((item: CatalogItem, qty: number) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.catalogItemId === item.id);
      let newCart: CartItem[];
      if (existing) {
        newCart = prev.map((c) =>
          c.catalogItemId === item.id ? { ...c, qty: c.qty + qty } : c
        );
      } else {
        newCart = [
          ...prev,
          {
            catalogItemId: item.id,
            sku: item.sku,
            name: item.name,
            brandId: item.brandId,
            brandName: item.brand.name,
            category: item.category,
            price: item.priceWholesale,
            currency: item.brand.currency,
            qty,
            minOrder: item.minOrder,
          },
        ];
      }
      saveCart(newCart);
      return newCart;
    });
    showToast(`✓ ${item.name} додано до замовлення`);
  }, [saveCart, showToast]);

  const removeFromCart = useCallback((catalogItemId: string) => {
    setCart((prev) => {
      const newCart = prev.filter((c) => c.catalogItemId !== catalogItemId);
      saveCart(newCart);
      return newCart;
    });
  }, [saveCart]);

  const updateCartQty = useCallback((catalogItemId: string, qty: number) => {
    setCart((prev) => {
      const newCart = qty <= 0
        ? prev.filter((c) => c.catalogItemId !== catalogItemId)
        : prev.map((c) => c.catalogItemId === catalogItemId ? { ...c, qty } : c);
      saveCart(newCart);
      return newCart;
    });
  }, [saveCart]);

  // ─── Find duplicates ────────────────────────────────────────────────────────
  const findDuplicates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/planner/duplicates");
      const data: CatalogItem[][] = await res.json();
      setDuplicates(data);
      setSection("duplicates");
      showToast(`Знайдено ${data.length} ${data.length === 1 ? "групу" : "груп"} дублів`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Export PO ──────────────────────────────────────────────────────────────
  const exportPO = () => {
    const rows = cart.map((c) => ({
      Brand: c.brandName,
      SKU: c.sku,
      Name: c.name,
      Category: c.category,
      Qty: c.qty,
      "Unit Price": c.price,
      Total: c.price * c.qty,
      Currency: c.currency,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchase Order");
    XLSX.writeFile(wb, `PO-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // ─── AI chat ────────────────────────────────────────────────────────────────
  const sendToAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg: AiMessage = { role: "user", content: aiInput };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setAiLoading(true);

    const brandSummary = budgetStatus
      .map((b) => `${b.name}: budget €${fmt(b.budget)}, spent €${fmt(b.spent)}, ${b.pct}%`)
      .join("\n");
    const cartSummary = cart.length
      ? cart.map((c) => `${c.brandName} — ${c.name} (${c.sku}) x${c.qty} @ ${c.currency}${c.price}`).join("\n")
      : "Cart is empty";

    const systemPrompt = `You are an AI assistant for a multi-brand fashion buyer.

CURRENT STATUS:
- Brands: ${brands.length}
- Catalog items: ${items.length}
- Cart: ${cart.length} lines, ${totalCartItems} units, €${fmt(totalSpent)} spent

BUDGET BY BRAND:
${brandSummary}

CURRENT ORDER:
${cartSummary}

Help with: buying recommendations, duplicate detection, budget optimization, margin analysis.
Be concise and data-driven. Respond in the same language as the user's message.`;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt,
          messages: [...aiMessages, userMsg],
        }),
      });
      const data = await res.json();
      setAiMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
    } catch {
      setAiMessages((prev) => [...prev, { role: "assistant", content: "Error contacting AI. Please try again." }]);
    } finally {
      setAiLoading(false);
    }
  };

  // ─── Refresh brands ─────────────────────────────────────────────────────────
  const reloadBrands = async () => {
    const res = await fetch("/api/planner/brands");
    setBrands(await res.json());
  };

  // ─── Unique categories from items ───────────────────────────────────────────
  const categories = [...new Set(items.map((i) => i.category))].sort();

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top nav ── */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-6 flex items-center justify-between h-13 shrink-0">
        <div className="flex items-center gap-1">
          {(
            [
              { id: "dashboard", label: "Огляд", icon: LayoutDashboard },
              { id: "catalog", label: "Каталог", icon: Package },
              { id: "duplicates", label: "Дублі", icon: GitCompare },
              { id: "cart", label: `Замовлення (${totalCartItems})`, icon: ShoppingCart },
              { id: "ai", label: "AI", icon: Sparkles },
              { id: "brands", label: "Бренди", icon: Building2 },
            ] as { id: Section; label: string; icon: React.ElementType }[]
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                section === id
                  ? "bg-[#00e5c4]/10 text-[#00e5c4]"
                  : "text-[var(--muted)] hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Budget quick pill */}
          <div className="text-xs font-mono text-[var(--muted)] bg-white/[0.03] border border-[var(--border)] px-3 py-1.5 rounded-lg">
            €{fmt(totalSpent)}{" "}
            <span className="text-[var(--subtle)]">/ €{fmt(totalBudget)}</span>
            {totalBudget > 0 && (
              <span className={`ml-2 ${totalSpent / totalBudget > 0.9 ? "text-[#ff6b35]" : "text-[#00e5c4]"}`}>
                {Math.round((totalSpent / totalBudget) * 100)}%
              </span>
            )}
          </div>

          {section === "catalog" && (
            <button
              onClick={() => setUploadModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-[#00e5c4] rounded-lg text-sm font-medium hover:bg-[#00e5c4]/20 transition-colors"
            >
              <Upload size={13} /> Завантажити
            </button>
          )}
          {section === "duplicates" && (
            <button
              onClick={findDuplicates}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.04] border border-[var(--border)] text-white rounded-lg text-sm font-medium hover:bg-white/[0.08] transition-colors disabled:opacity-50"
            >
              <Search size={13} /> {loading ? "Скануємо…" : "Сканувати"}
            </button>
          )}
          {section === "cart" && cart.length > 0 && (
            <button
              onClick={exportPO}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#a78bfa]/10 border border-[#a78bfa]/20 text-[#a78bfa] rounded-lg text-sm font-medium hover:bg-[#a78bfa]/20 transition-colors"
            >
              <Download size={13} /> Експорт ЗП
            </button>
          )}
          {section === "brands" && (
            <button
              onClick={() => setBrandModal("new")}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-[#00e5c4] rounded-lg text-sm font-medium hover:bg-[#00e5c4]/20 transition-colors"
            >
              <Plus size={13} /> Додати бренд
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto p-6">
        {section === "dashboard" && (
          <DashboardView brands={brands} catalogs={catalogs} budgetStatus={budgetStatus} cart={cart} fmt={fmt} />
        )}
        {section === "catalog" && (
          <CatalogView
            brands={brands}
            items={items}
            categories={categories}
            loading={loading}
            filterBrand={filterBrand}
            filterCategory={filterCategory}
            filterSearch={filterSearch}
            setFilterBrand={setFilterBrand}
            setFilterCategory={setFilterCategory}
            setFilterSearch={setFilterSearch}
            onSearch={loadItems}
            addToCart={addToCart}
            fmt={fmt}
          />
        )}
        {section === "duplicates" && (
          <DuplicatesView groups={duplicates} addToCart={addToCart} fmt={fmt} />
        )}
        {section === "cart" && (
          <CartView
            cart={cart}
            budgetStatus={budgetStatus}
            removeFromCart={removeFromCart}
            updateQty={updateCartQty}
            fmt={fmt}
          />
        )}
        {section === "ai" && (
          <AIView messages={aiMessages} input={aiInput} loading={aiLoading} onInputChange={setAiInput} onSend={sendToAI} />
        )}
        {section === "brands" && (
          <BrandsView brands={brands} catalogs={catalogs} onEdit={(b) => setBrandModal(b)} fmt={fmt} />
        )}
      </div>

      {/* ── Upload Modal ── */}
      {uploadModal && (
        <UploadModal
          brands={brands}
          onClose={() => setUploadModal(false)}
          onSuccess={async (msg) => {
            showToast(msg);
            setUploadModal(false);
            const res = await fetch("/api/planner/catalogs");
            // re-load catalogs list — simple approach: reload page data on next visit
            // for now just reload items if we're in catalog view
            if (section === "catalog") loadItems();
          }}
        />
      )}

      {/* ── Brand Modal ── */}
      {brandModal && (
        <BrandModal
          brand={brandModal === "new" ? null : brandModal}
          onClose={() => setBrandModal(null)}
          onSave={async () => {
            await reloadBrands();
            setBrandModal(null);
            showToast("Бренд збережено");
          }}
          onDelete={async (id) => {
            await fetch(`/api/planner/brands/${id}`, { method: "DELETE" });
            await reloadBrands();
            setBrandModal(null);
            showToast("Бренд видалено");
          }}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-[var(--surface)] border border-[#00e5c4]/30 text-[#00e5c4] text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VIEWS
// ══════════════════════════════════════════════════════════════════════════════

function DashboardView({ brands, catalogs, budgetStatus, cart, fmt }: {
  brands: Brand[];
  catalogs: CatalogUpload[];
  budgetStatus: (Brand & { spent: number; remaining: number; pct: number })[];
  cart: CartItem[];
  fmt: (n: number) => string;
}) {
  const totalItems = [...new Set(catalogs.flatMap((c) => c.itemCount))].reduce((s, n) => s + n, 0);
  const totalUnits = cart.reduce((s, c) => s + c.qty, 0);

  const stats = [
    { label: "Брендів", value: brands.length, sub: `${catalogs.length} каталогів` },
    { label: "Товарів у каталозі", value: totalItems, sub: "по всіх брендах" },
    { label: "У замовленні", value: cart.length, sub: `${totalUnits} одиниць` },
    {
      label: "Бюджет використано",
      value: `${Math.round((budgetStatus.reduce((s, b) => s + b.spent, 0) / Math.max(budgetStatus.reduce((s, b) => s + b.budget, 0), 1)) * 100)}%`,
      sub: `€${fmt(budgetStatus.reduce((s, b) => s + b.spent, 0))} з €${fmt(budgetStatus.reduce((s, b) => s + b.budget, 0))}`,
    },
  ];

  return (
    <div className="max-w-4xl">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, sub }) => (
          <div key={label} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">{label}</div>
            <div className="text-2xl font-bold text-white font-mono mb-1">{value}</div>
            <div className="text-xs text-[var(--muted)]">{sub}</div>
          </div>
        ))}
      </div>

      {/* Budget bars */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-4">
        <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-4">Бюджет по брендах</div>
        {budgetStatus.length === 0 && (
          <p className="text-[var(--muted)] text-sm">Брендів ще немає. Додайте бренди для відстеження бюджету.</p>
        )}
        {budgetStatus.map((b) => (
          <div key={b.id} className="flex items-center gap-4 py-2 border-b border-[var(--border-faint)] last:border-0">
            <div className="w-32 text-sm text-white font-medium truncate">{b.name}</div>
            <div className="flex-1 h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(b.pct, 100)}%`,
                  background: b.pct > 100 ? "#ff6b35" : b.pct > 80 ? "#fbbf24" : "#00e5c4",
                }}
              />
            </div>
            <div className="text-xs font-mono text-[var(--muted)] w-24 text-right">
              €{fmt(b.spent)} / €{fmt(b.budget)}
            </div>
            <div className={`text-xs font-mono w-10 text-right ${b.pct > 100 ? "text-[#ff6b35]" : "text-[var(--muted)]"}`}>
              {b.pct}%
            </div>
          </div>
        ))}
      </div>

      {/* Recent catalogs */}
      {catalogs.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-4">Останні завантаження</div>
          <div className="space-y-2">
            {catalogs.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1.5">
                <div>
                  <span className="text-sm text-white font-medium">{c.brand.name}</span>
                  <span className="text-[var(--subtle)] mx-2">·</span>
                  <span className="text-xs font-mono text-[#00e5c4]">{c.season}</span>
                </div>
                <span className="text-xs text-[var(--muted)]">{c.itemCount} items</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogView({ brands, items, categories, loading, filterBrand, filterCategory, filterSearch, setFilterBrand, setFilterCategory, setFilterSearch, onSearch, addToCart, fmt }: {
  brands: Brand[];
  items: CatalogItem[];
  categories: string[];
  loading: boolean;
  filterBrand: string;
  filterCategory: string;
  filterSearch: string;
  setFilterBrand: (v: string) => void;
  setFilterCategory: (v: string) => void;
  setFilterSearch: (v: string) => void;
  onSearch: () => void;
  addToCart: (item: CatalogItem, qty: number) => void;
  fmt: (n: number) => string;
}) {
  const qtyRefs = useRef<Record<string, HTMLInputElement>>({});

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={filterBrand}
          onChange={(e) => setFilterBrand(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#00e5c4]/40"
        >
          <option value="all">Всі бренди</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#00e5c4]/40"
        >
          <option value="all">Всі категорії</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="text"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="Пошук назви / артикулу…"
          className="flex-1 min-w-40 bg-[var(--surface)] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#00e5c4]/40 placeholder:text-[#3d444d]"
        />
        <button
          onClick={onSearch}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] border border-[var(--border)] text-white text-sm rounded-lg hover:bg-white/[0.08] transition-colors disabled:opacity-50"
        >
          {loading ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
          Шукати
        </button>
      </div>

      {/* Items grid */}
      {items.length === 0 && !loading && (
        <div className="text-center py-20 text-[var(--muted)]">
          {brands.length === 0
            ? "Спочатку додайте бренд, потім завантажте каталог."
            : "Товарів не знайдено. Завантажте каталог або змініть фільтри."}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {items.map((item) => {
          const margin = item.priceRetail
            ? Math.round(((item.priceRetail - item.priceWholesale) / item.priceRetail) * 100)
            : null;

          return (
            <div key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-white/[0.14] transition-colors group">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-mono text-[#00e5c4]">{item.sku}</span>
                {margin !== null && (
                  <span className="text-[10px] font-mono bg-[#3fb950]/10 text-[#3fb950] px-1.5 py-0.5 rounded">
                    {margin}%
                  </span>
                )}
              </div>
              <p className="text-sm text-white font-medium leading-snug mb-1 line-clamp-2">{item.name}</p>
              <p className="text-[11px] text-[var(--muted)] mb-2">
                {item.brand.name} · {item.category}
                {item.color && ` · ${item.color}`}
              </p>
              <div className="text-lg font-bold font-mono text-white mb-3">
                {item.brand.currency}{item.priceWholesale.toFixed(0)}
              </div>
              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {item.tags.slice(0, 2).map((t) => (
                    <span key={t} className="text-[9px] bg-white/[0.05] text-[var(--muted)] px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--subtle)]">{item.stockAvail} avail</span>
                <input
                  ref={(el) => { if (el) qtyRefs.current[item.id] = el; }}
                  type="number"
                  min={1}
                  defaultValue={item.minOrder}
                  className="w-12 bg-white/[0.05] border border-[var(--border)] text-white text-xs rounded px-1.5 py-1 focus:outline-none text-center"
                />
                <button
                  onClick={() => {
                    const qty = parseInt(qtyRefs.current[item.id]?.value ?? "1");
                    addToCart(item, qty || item.minOrder);
                  }}
                  className="flex-1 bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-[#00e5c4] text-xs font-medium rounded-lg py-1.5 hover:bg-[#00e5c4]/20 transition-colors"
                >
                  + Додати
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DuplicatesView({ groups, addToCart, fmt }: {
  groups: CatalogItem[][];
  addToCart: (item: CatalogItem, qty: number) => void;
  fmt: (n: number) => string;
}) {
  if (groups.length === 0) {
    return (
      <div className="text-center py-20">
        <GitCompare size={40} className="mx-auto text-[#3d444d] mb-4" />
        <p className="text-white font-medium mb-1">Сканування ще не виконано</p>
        <p className="text-[var(--muted)] text-sm">Натисніть «Сканувати» щоб знайти схожі позиції між брендами</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-[var(--muted)] text-sm mb-4">
        Знайдено {groups.length} {groups.length === 1 ? "групу" : "групи"} схожих позицій між різними брендами
      </p>
      {groups.map((group, i) => (
        <div key={i} className="bg-[var(--surface)] border border-[#ff6b35]/20 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-[#ff6b35]" />
              <span className="text-white font-medium text-sm">
                {group[0].category}
                {group[0].color && ` · ${group[0].color}`}
                {group[0].style && ` · ${group[0].style}`}
              </span>
            </div>
            <span className="text-[10px] font-mono bg-[#ff6b35]/10 text-[#ff6b35] px-2 py-0.5 rounded">
              {group.length} brands
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            {group.map((item) => (
              <div key={item.id} className="bg-white/[0.03] border border-[var(--border)] rounded-lg p-3">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-mono text-[#00e5c4]">{item.brand.name}</span>
                  <span className="text-sm font-bold text-white">{item.brand.currency}{item.priceWholesale}</span>
                </div>
                <p className="text-sm text-white font-medium mb-1">{item.name}</p>
                <p className="text-[11px] text-[var(--muted)] mb-2 font-mono">{item.sku}</p>
                <button
                  onClick={() => addToCart(item, item.minOrder)}
                  className="w-full text-[11px] bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-[#00e5c4] py-1.5 rounded-lg hover:bg-[#00e5c4]/20 transition-colors"
                >
                  До замовлення
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CartView({ cart, budgetStatus, removeFromCart, updateQty, fmt }: {
  cart: CartItem[];
  budgetStatus: (Brand & { spent: number; remaining: number; pct: number })[];
  removeFromCart: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  fmt: (n: number) => string;
}) {
  if (cart.length === 0) {
    return (
      <div className="text-center py-20">
        <ShoppingCart size={40} className="mx-auto text-[#3d444d] mb-4" />
        <p className="text-white font-medium mb-1">Замовлення порожнє</p>
        <p className="text-[var(--muted)] text-sm">Перейдіть до Каталогу та додайте товари</p>
      </div>
    );
  }

  // Group by brand
  const byBrand: Record<string, CartItem[]> = {};
  cart.forEach((item) => {
    if (!byBrand[item.brandId]) byBrand[item.brandId] = [];
    byBrand[item.brandId].push(item);
  });

  return (
    <div className="max-w-3xl space-y-4">
      {Object.entries(byBrand).map(([brandId, items]) => {
        const b = budgetStatus.find((bs) => bs.id === brandId);
        const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
        return (
          <div key={brandId} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-white font-semibold">{b?.name ?? brandId}</span>
              <div className="flex items-center gap-4 text-sm font-mono">
                <span className="text-white">€{fmt(subtotal)}</span>
                {b && b.budget > 0 && (
                  <span className={b.remaining < 0 ? "text-[#ff6b35]" : "text-[var(--muted)]"}>
                    {b.remaining >= 0 ? "€" + fmt(b.remaining) + " left" : "€" + fmt(Math.abs(b.remaining)) + " over"}
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {items.map((item) => (
                <div key={item.catalogItemId} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{item.name}</p>
                    <p className="text-[10px] font-mono text-[var(--muted)]">{item.sku} · {item.category}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(e) => updateQty(item.catalogItemId, parseInt(e.target.value) || 0)}
                      className="w-14 bg-white/[0.05] border border-[var(--border)] text-white text-sm rounded-lg px-2 py-1.5 text-center focus:outline-none"
                    />
                    <span className="text-sm font-mono text-white w-20 text-right">
                      €{fmt(item.price * item.qty)}
                    </span>
                    <button
                      onClick={() => removeFromCart(item.catalogItemId)}
                      className="text-[var(--muted)] hover:text-[#ff6b35] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Total */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex justify-between items-center">
        <span className="text-[var(--muted)] text-sm">Загальна сума замовлення</span>
        <span className="text-2xl font-bold text-white font-mono">
          €{fmt(cart.reduce((s, c) => s + c.price * c.qty, 0))}
        </span>
      </div>
    </div>
  );
}

function AIView({ messages, input, loading, onInputChange, onSend }: {
  messages: AiMessage[];
  input: string;
  loading: boolean;
  onInputChange: (v: string) => void;
  onSend: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-w-3xl">
      <div className="flex-1 overflow-auto space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <Sparkles size={40} className="mx-auto text-[#fbbf24] mb-4" />
            <p className="text-white font-semibold mb-2">Запитайте мене про асортимент</p>
            <div className="text-[var(--muted)] text-sm space-y-1">
              <p>• Які товари пріоритетні для закупки?</p>
              <p>• Де є ризики перевищення бюджету?</p>
              <p>• Є дублі між брендами?</p>
              <p>• Як розподілити бюджет оптимально?</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "ml-auto bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-white"
                : "bg-[var(--surface)] border border-[var(--border)] text-[#e8ecf0]"
            }`}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--muted)] italic max-w-[80%]">
            Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && onSend()}
          placeholder="Запитайте про асортимент, бюджет, дублі…"
          disabled={loading}
          className="flex-1 bg-[var(--surface)] border border-[var(--border)] text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#00e5c4]/40 placeholder:text-[#3d444d]"
        />
        <button
          onClick={onSend}
          disabled={loading || !input.trim()}
          className="px-5 bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-[#00e5c4] rounded-xl font-medium hover:bg-[#00e5c4]/20 transition-colors disabled:opacity-50"
        >
          →
        </button>
      </div>
    </div>
  );
}

function BrandsView({ brands, catalogs, onEdit, fmt }: {
  brands: Brand[];
  catalogs: CatalogUpload[];
  onEdit: (b: Brand) => void;
  fmt: (n: number) => string;
}) {
  return (
    <div className="max-w-3xl">
      {brands.length === 0 && (
        <div className="text-center py-16 text-[var(--muted)]">
          Брендів ще немає. Натисніть «Додати бренд» щоб почати.
        </div>
      )}
      <div className="space-y-3">
        {brands.map((b) => {
          const brandCatalogs = catalogs.filter((c) => c.brandId === b.id);
          return (
            <div
              key={b.id}
              onClick={() => onEdit(b)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 cursor-pointer hover:border-white/[0.14] transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-white font-semibold mb-1">{b.name}</h3>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--muted)]">
                    <span>Budget: {b.currency}{fmt(b.budget)}</span>
                    <span>Net {b.paymentDays}d</span>
                    <span>Lead {b.leadTimeDays}d</span>
                    {b.country && <span>{b.country}</span>}
                  </div>
                </div>
                <span className="text-xs text-[var(--subtle)]">{brandCatalogs.length} каталогів</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ brands, onClose, onSuccess }: {
  brands: Brand[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [season, setSeason] = useState("SS26");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    if (!brandId) { setError("Select a brand first"); return; }
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("brandId", brandId);
      fd.append("season", season);
      const res = await fetch("/api/planner/catalogs/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onSuccess(`✓ Uploaded ${data.itemCount} items`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-7 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white font-semibold text-lg">Завантажити каталог</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white"><X size={18} /></button>
        </div>

        <p className="text-[var(--muted)] text-xs font-mono mb-4">
          Колонки: SKU, Name, Category, Color, Style, Material, Price, Retail, MinOrder, Stock, LeadTime, Tags
        </p>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">Бренд</label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="w-full bg-[#161b22] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none"
            >
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">Сезон</label>
            <input
              type="text"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="w-full bg-[#161b22] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none"
              placeholder="SS26"
            />
          </div>
        </div>

        <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${loading ? "opacity-50 cursor-not-allowed" : "border-white/[0.1] hover:border-[#00e5c4]/40"}`}>
          <Upload size={24} className="text-[var(--muted)] mb-2" />
          <span className="text-sm text-[var(--muted)]">{loading ? "Завантажуємо…" : "Клікніть або перетягніть .xlsx / .csv"}</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={loading}
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        </label>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </div>
    </div>
  );
}

// ── Brand Modal ───────────────────────────────────────────────────────────────

function BrandModal({ brand, onClose, onSave, onDelete }: {
  brand: Brand | null;
  onClose: () => void;
  onSave: () => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: brand?.name ?? "",
    budget: String(brand?.budget ?? 0),
    paymentDays: String(brand?.paymentDays ?? 30),
    currency: brand?.currency ?? "EUR",
    country: brand?.country ?? "",
    contact: brand?.contact ?? "",
    leadTimeDays: String(brand?.leadTimeDays ?? 28),
    moq: String(brand?.moq ?? 1),
  });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleSave() {
    setLoading(true);
    const body = {
      name: form.name,
      budget: parseFloat(form.budget),
      paymentDays: parseInt(form.paymentDays),
      currency: form.currency,
      country: form.country || null,
      contact: form.contact || null,
      leadTimeDays: parseInt(form.leadTimeDays),
      moq: parseInt(form.moq),
    };
    if (brand) {
      await fetch(`/api/planner/brands/${brand.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/planner/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setLoading(false);
    onSave();
  }

  const inputClass = "w-full bg-[#161b22] border border-[var(--border)] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#00e5c4]/40";
  const labelClass = "block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-7 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white font-semibold text-lg">{brand ? "Редагувати бренд" : "Додати бренд"}</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div><label className={labelClass}>Назва бренду</label><input type="text" value={form.name} onChange={set("name")} className={inputClass} placeholder="Prada S.p.A." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Бюджет сезону</label><input type="number" value={form.budget} onChange={set("budget")} className={inputClass} /></div>
            <div>
              <label className={labelClass}>Валюта</label>
              <select value={form.currency} onChange={set("currency")} className={inputClass}>
                {["EUR", "USD", "UAH", "GBP"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Відстрочка (днів)</label><input type="number" value={form.paymentDays} onChange={set("paymentDays")} className={inputClass} /></div>
            <div><label className={labelClass}>Лід-тайм (днів)</label><input type="number" value={form.leadTimeDays} onChange={set("leadTimeDays")} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Країна</label><input type="text" value={form.country} onChange={set("country")} className={inputClass} placeholder="Italy" /></div>
          <div><label className={labelClass}>Контактний email</label><input type="email" value={form.contact} onChange={set("contact")} className={inputClass} placeholder="orders@brand.com" /></div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={loading || !form.name}
            className="flex-1 bg-[#00e5c4] hover:bg-[#00c9ab] disabled:opacity-50 text-[#0d1117] font-semibold rounded-lg py-2.5 text-sm transition-colors">
            {loading ? "Зберігаємо…" : "Зберегти"}
          </button>
          {brand && (
            <button onClick={() => onDelete(brand.id)}
              className="px-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
