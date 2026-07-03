"use client";

import { useState, useEffect, useRef } from "react";
import { RefreshCw, Sparkles, Send } from "lucide-react";
import { useLang } from "@/components/LanguageProvider";
import type { ClassifiedSku, SkuFlag, ClassifySummary } from "@/lib/analyst-types";
interface AiMsg { role: "user" | "assistant"; content: string }

interface Props {
  initialSkus: ClassifiedSku[];
  initialSummary: ClassifySummary;
  businessModel: string | null;
  tenantName: string;
}

// ─── Flag config ──────────────────────────────────────────────────────────────

const FLAG: Record<SkuFlag, { emoji: string; label_uk: string; label_en: string; color: string; bg: string }> = {
  hit:      { emoji: "🔥", label_uk: "Хіт",         label_en: "Hit",        color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  stockout: { emoji: "🛑", label_uk: "Стокаут",      label_en: "Stockout",   color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  slow:     { emoji: "📉", label_uk: "Слоу-мувер",   label_en: "Slow mover", color: "#fb923c", bg: "rgba(251,146,60,0.1)" },
  dead:     { emoji: "💤", label_uk: "Зависший",     label_en: "Dead stock", color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
  ok:       { emoji: "✅", label_uk: "Норма",         label_en: "OK",         color: "#86efac", bg: "rgba(134,239,172,0.1)" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnalystApp({ initialSkus, initialSummary, businessModel, tenantName }: Props) {
  const { lang } = useLang();
  const uk = lang === "uk";

  const [skus, setSkus] = useState<ClassifiedSku[]>(initialSkus);
  const [summary, setSummary] = useState<ClassifySummary>(initialSummary);
  const [activeFlag, setActiveFlag] = useState<SkuFlag | "all">("all");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [aiMsgs, setAiMsgs] = useState<AiMsg[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [aiMsgs]);

  const reload = async (flag?: SkuFlag | "all") => {
    setLoading(true);
    try {
      const params = flag && flag !== "all" ? `?flag=${flag}` : "";
      const res = await fetch(`/api/analyst/classify${params}`);
      const data = await res.json();
      setSkus(data.skus);
      setSummary(data.summary);
    } finally {
      setLoading(false);
    }
  };

  const setFilter = (f: SkuFlag | "all") => {
    setActiveFlag(f);
    setPage(1);
    reload(f);
  };

  const sendAi = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const msg: AiMsg = { role: "user", content: aiInput };
    setAiMsgs((p) => [...p, msg]);
    setAiInput("");
    setAiLoading(true);

    const systemPrompt = `Ти — Агент Аналітик для магазину "${tenantName}".
Бізнес-модель: ${businessModel ?? "не вказано"}.

ПОТОЧНИЙ СТАН (${new Date().toLocaleDateString(uk ? "uk-UA" : "en-GB")}):
- Всього SKU: ${summary.total}
- 🔥 Хіти: ${summary.hit}
- 🛑 Стокаут ризик: ${summary.stockout}
- 📉 Слоу-мувери: ${summary.slow}
- 💤 Зависших: ${summary.dead}

ТОП ПРОБЛЕМИ:
${skus.filter(s => ["hit","stockout"].includes(s.flag)).slice(0,5)
  .map(s => `- ${FLAG[s.flag].emoji} ${s.name}: залишок ${s.stock} шт, ${s.daysOfStock} днів запасу, lead time ${s.leadTime}д`)
  .join("\n") || "Немає критичних проблем"}

Відповідай структуровано. Давай конкретні рекомендації з числами. Мова відповіді відповідає мові запиту.`;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt, messages: [...aiMsgs, msg] }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const errMsg = data.error ?? `HTTP ${res.status}`;
        setAiMsgs((p) => [...p, { role: "assistant", content: `❌ ${uk ? "Помилка" : "Error"}: ${errMsg}` }]);
      } else {
        setAiMsgs((p) => [...p, { role: "assistant", content: data.content }]);
      }
    } catch (e) {
      setAiMsgs((p) => [...p, { role: "assistant", content: `❌ ${uk ? "Помилка мережі" : "Network error"}: ${String(e)}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  const flagLabel = (f: SkuFlag) => uk ? FLAG[f].label_uk : FLAG[f].label_en;

  const totalPages = Math.max(1, Math.ceil(skus.length / pageSize));
  const pagedSkus = skus.slice((page - 1) * pageSize, page * pageSize);

  // ── Empty state ──
  if (summary.total === 0 && !loading) {
    return (
      <div className="p-8 max-w-3xl">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">
          {uk ? "Аналітика" : "Analytics"}
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">
          {uk ? "Агент Аналітик" : "Analyst Agent"}
        </h1>
        <div className="mt-8 bg-[var(--surface)] border border-[#fbbf24]/20 rounded-xl p-8 text-center">
          <div className="text-3xl mb-3">📦</div>
          <p className="text-white font-semibold mb-2">
            {uk ? "Немає даних для аналізу" : "No data to analyze"}
          </p>
          <p className="text-[var(--muted)] text-sm mb-4">
            {uk
              ? "Імпортуйте товари та дані продажів щоб агент міг класифікувати асортимент"
              : "Import products and sales data so the agent can classify your assortment"}
          </p>
          <a href="/settings" className="inline-flex px-4 py-2 bg-[#fbbf24]/10 border border-[#fbbf24]/20 text-[#fbbf24] rounded-lg text-sm font-medium hover:bg-[#fbbf24]/20 transition-colors">
            {uk ? "Підключити дані →" : "Connect data →"}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-1">
            {uk ? "Аналітика" : "Analytics"}
          </div>
          <h1 className="text-2xl font-bold text-white">
            {uk ? "Агент Аналітик" : "Analyst Agent"}
          </h1>
        </div>
        <button onClick={() => reload(activeFlag)} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-[var(--border)] text-[var(--muted)] hover:text-white text-sm rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {uk ? "Оновити" : "Refresh"}
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {(["hit", "stockout", "slow", "dead", "ok"] as SkuFlag[]).map((f) => (
          <button key={f} onClick={() => setFilter(f === activeFlag ? "all" : f)}
            className={`text-left bg-[var(--surface)] border rounded-xl p-4 transition-colors ${activeFlag === f ? "border-white/[0.2]" : "border-[var(--border)] hover:border-white/[0.14]"}`}>
            <div className="text-2xl mb-1">{FLAG[f].emoji}</div>
            <div className="text-xl font-bold font-mono" style={{ color: FLAG[f].color }}>
              {summary[f]}
            </div>
            <div className="text-[10px] text-[var(--muted)] mt-0.5">{flagLabel(f)}</div>
          </button>
        ))}
      </div>

      {/* AI Chat — above table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mb-6">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border)]">
          <Sparkles size={14} className="text-[#fbbf24]" />
          <span className="text-sm font-medium text-white">
            {uk ? "Запитати агента" : "Ask the agent"}
          </span>
        </div>

        <div ref={chatRef} className="h-56 overflow-auto p-4 space-y-3">
          {aiMsgs.length === 0 && (
            <div className="text-center py-6">
              <p className="text-[var(--subtle)] text-sm">
                {uk
                  ? "Запитайте про конкретний товар, ситуацію зі стоком або рекомендації"
                  : "Ask about a specific product, stock situation or recommendations"}
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-3">
                {[
                  uk ? "Що терміново дозамовити?" : "What to reorder urgently?",
                  uk ? "Топ-5 проблемних позицій" : "Top 5 problem items",
                  uk ? "Що акційно просувати?" : "What to promote on sale?",
                ].map((q) => (
                  <button key={q} onClick={() => setAiInput(q)}
                    className="text-[11px] px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--border)] text-[var(--muted)] rounded-lg hover:text-[var(--text)] hover:border-[var(--border-faint)] transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {aiMsgs.map((m, i) => (
            <div key={i} className={`max-w-[85%] px-4 py-2.5 rounded-xl text-sm whitespace-pre-wrap leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-white"
                : "bg-[var(--surface2)] border border-[var(--border)] text-[#e8ecf0]"
            }`}>
              {m.content}
            </div>
          ))}
          {aiLoading && (
            <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--muted)] italic max-w-[85%]">
              {uk ? "Аналізую…" : "Analyzing…"}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-3 border-t border-[var(--border)]">
          <input type="text" value={aiInput} onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !aiLoading && sendAi()}
            disabled={aiLoading}
            placeholder={uk ? "Запитайте про стан асортименту…" : "Ask about your assortment…"}
            className="flex-1 bg-[var(--surface2)] border border-[var(--border)] text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#00e5c4]/40 placeholder:text-[#3d444d]"
          />
          <button onClick={sendAi} disabled={aiLoading || !aiInput.trim()}
            className="px-4 bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-[#00e5c4] rounded-xl hover:bg-[#00e5c4]/20 transition-colors disabled:opacity-40">
            <Send size={15} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeFlag === "all" ? "bg-[var(--input-bg)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
          {uk ? `Всі (${summary.total})` : `All (${summary.total})`}
        </button>
        {(["hit", "stockout", "slow", "dead"] as SkuFlag[]).filter((f) => summary[f] > 0).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeFlag === f ? "text-white" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
            style={activeFlag === f ? { background: FLAG[f].bg, color: FLAG[f].color } : undefined}>
            {FLAG[f].emoji} {flagLabel(f)} ({summary[f]})
          </button>
        ))}

        {/* Page size selector */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[var(--subtle)]">
            {uk ? "На сторінці:" : "Per page:"}
          </span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-xs rounded-lg px-2 py-1.5 focus:outline-none"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* SKU table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] px-4 py-3">
                  {uk ? "Артикул / Назва" : "SKU / Name"}
                </th>
                <th className="text-left text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] px-3 py-3 hidden md:table-cell">
                  {uk ? "Бренд / Категорія" : "Brand / Category"}
                </th>
                <th className="text-right text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] px-3 py-3">
                  {uk ? "Залишок" : "Stock"}
                </th>
                <th className="text-right text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] px-3 py-3 hidden lg:table-cell">
                  {uk ? "Продажі 7д / 30д" : "Sales 7d / 30d"}
                </th>
                <th className="text-right text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] px-3 py-3 hidden lg:table-cell">
                  {uk ? "Днів запасу" : "Days of stock"}
                </th>
                <th className="text-center text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] px-3 py-3">
                  {uk ? "Статус" : "Status"}
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedSkus.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border-faint)] hover:bg-[var(--input-bg)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-[10px] font-mono text-[#00e5c4]">{s.sku}</div>
                    <div className="text-[var(--text)] text-sm font-medium truncate max-w-48">{s.name}</div>
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <div className="text-[var(--muted)] text-xs">{s.brand ?? "—"}</div>
                    <div className="text-[var(--subtle)] text-[11px]">{s.category}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-[var(--text)] font-mono">{s.stock}</span>
                    <span className="text-[var(--subtle)] text-[10px] ml-1">{uk ? "шт" : "pcs"}</span>
                  </td>
                  <td className="px-3 py-3 text-right hidden lg:table-cell">
                    <span className="text-[var(--text)] font-mono">{s.sold7}</span>
                    <span className="text-[var(--subtle)] mx-1">/</span>
                    <span className="text-[var(--muted)] font-mono">{s.sold30}</span>
                  </td>
                  <td className="px-3 py-3 text-right hidden lg:table-cell">
                    <span className={`font-mono ${s.daysOfStock < s.leadTime * 1.5 ? "text-[#fca5a5]" : s.daysOfStock > 90 ? "text-[#93c5fd]" : "text-[var(--muted)]"}`}>
                      {s.daysOfStock >= 9999 ? "—" : s.daysOfStock}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-lg" title={flagLabel(s.flag)}>{FLAG[s.flag].emoji}</span>
                  </td>
                </tr>
              ))}
              {pagedSkus.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-[var(--subtle)] py-8 text-sm">
                    {uk ? "Немає товарів для відображення" : "No items to display"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mb-8">
          <span className="text-xs text-[var(--subtle)] font-mono">
            {uk
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, skus.length)} з ${skus.length}`
              : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, skus.length)} of ${skus.length}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 transition-colors"
            >«</button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] rounded-lg disabled:opacity-30 transition-colors"
            >
              {uk ? "← Назад" : "← Prev"}
            </button>

            {/* Page numbers */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const p = start + i;
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 text-xs rounded-lg transition-colors ${
                    p === page
                      ? "bg-[#00e5c4]/10 border border-[#00e5c4]/30 text-[#00e5c4]"
                      : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)]"
                  }`}
                >
                  {p}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] rounded-lg disabled:opacity-30 transition-colors"
            >
              {uk ? "Далі →" : "Next →"}
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 transition-colors"
            >»</button>
          </div>
        </div>
      )}
    </div>
  );
}
