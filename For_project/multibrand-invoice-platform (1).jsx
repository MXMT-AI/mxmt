import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

// ─── DEMO DATA ──────────────────────────────────────────────────────────────

const DEMO_BRANDS = [
  { id: "prada", name: "Prada S.p.A.", category: "Ready-to-wear", paymentDays: 60, currency: "EUR", contact: "accounts@prada.com" },
  { id: "gucci", name: "Guccio Gucci S.p.A.", category: "Accessories", paymentDays: 90, currency: "EUR", contact: "finance@gucci.com" },
  { id: "valentino", name: "Valentino S.p.A.", category: "Couture", paymentDays: 30, currency: "EUR", contact: "billing@valentino.com" },
  { id: "marni", name: "Marni S.r.l.", category: "Ready-to-wear", paymentDays: 45, currency: "EUR", contact: "ar@marni.com" },
  { id: "bottega", name: "Bottega Veneta S.r.l.", category: "Leather Goods", paymentDays: 60, currency: "EUR", contact: "payments@bottegaveneta.com" },
];

const today = new Date();
const d = (offset) => { const dt = new Date(today); dt.setDate(dt.getDate() + offset); return dt.toISOString().split("T")[0]; };

const DEMO_INVOICES = [
  { id: "inv1", brandId: "prada", invoiceNumber: "PR-2025-0041", invoiceDate: d(-20), dueDate: d(40), status: "approved", totalAmount: 128400, currency: "EUR", items: [{ sku: "PR-BG-001", description: "Saffiano Leather Bag SS25", qty: 12, unit: "pz", unitPrice: 4200, vat: 22, subtotal: 50400, vatAmount: 11088, total: 61488 }, { sku: "PR-SH-002", description: "Nylon Shoulder Bag Mini", qty: 18, unit: "pz", unitPrice: 2100, vat: 22, subtotal: 37800, vatAmount: 8316, total: 46116 }], notes: "" },
  { id: "inv2", brandId: "gucci", invoiceNumber: "GU-2025-0198", invoiceDate: d(-5), dueDate: d(85), status: "new", totalAmount: 245000, currency: "EUR", items: [{ sku: "GU-SS-410", description: "GG Supreme Canvas Sneakers", qty: 30, unit: "pz", unitPrice: 2800, vat: 22, subtotal: 84000, vatAmount: 18480, total: 102480 }, { sku: "GU-WL-220", description: "Ophidia Card Case Wallet", qty: 50, unit: "pz", unitPrice: 890, vat: 22, subtotal: 44500, vatAmount: 9790, total: 54290 }], notes: "" },
  { id: "inv3", brandId: "valentino", invoiceNumber: "VA-2025-0055", invoiceDate: d(-35), dueDate: d(-5), status: "overdue", totalAmount: 87600, currency: "EUR", items: [{ sku: "VA-SD-301", description: "Rockstud Sandal 90mm", qty: 24, unit: "pz", unitPrice: 1850, vat: 22, subtotal: 44400, vatAmount: 9768, total: 54168 }], notes: "Attenzione — pagamento scaduto!" },
  { id: "inv4", brandId: "marni", invoiceNumber: "MR-2025-0022", invoiceDate: d(-10), dueDate: d(5), status: "approved", totalAmount: 53200, currency: "EUR", items: [{ sku: "MR-JK-115", description: "Multicolour Patchwork Jacket", qty: 8, unit: "pz", unitPrice: 3400, vat: 22, subtotal: 27200, vatAmount: 5984, total: 33184 }, { sku: "MR-TR-088", description: "Floral Print Trousers", qty: 10, unit: "pz", unitPrice: 1200, vat: 22, subtotal: 12000, vatAmount: 2640, total: 14640 }], notes: "" },
  { id: "inv5", brandId: "prada", invoiceNumber: "PR-2025-0037", invoiceDate: d(-70), dueDate: d(-10), status: "paid", totalAmount: 96000, currency: "EUR", items: [{ sku: "PR-SH-770", description: "Re-Nylon Tote Bag FW24", qty: 20, unit: "pz", unitPrice: 2400, vat: 22, subtotal: 48000, vatAmount: 10560, total: 58560 }], notes: "Pagato il " + d(-2) },
  { id: "inv6", brandId: "bottega", invoiceNumber: "BV-2025-0011", invoiceDate: d(-3), dueDate: d(57), status: "new", totalAmount: 312000, currency: "EUR", items: [{ sku: "BV-PH-090", description: "Intrecciato Leather Phone Case", qty: 40, unit: "pz", unitPrice: 980, vat: 22, subtotal: 39200, vatAmount: 8624, total: 47824 }, { sku: "BV-CL-440", description: "Cassette Crossbody Bag", qty: 60, unit: "pz", unitPrice: 3800, vat: 22, subtotal: 228000, vatAmount: 50160, total: 278160 }], notes: "" },
];

// ─── HELPERS ────────────────────────────────────────────────────────────────

const diffDays = (dateStr) => {
  const diff = new Date(dateStr) - new Date(new Date().toISOString().split("T")[0]);
  return Math.round(diff / 86400000);
};

const fmt = (n) => Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const urgency = (inv) => {
  if (inv.status === "paid") return "paid";
  const d = diffDays(inv.dueDate);
  if (d < 0) return "overdue";
  if (d <= 7) return "critical";
  if (d <= 15) return "soon";
  return "ok";
};

const STATUS_CONFIG = {
  new:        { label: "Nuovo",           color: "#64748b", bg: "#f1f5f9" },
  processing: { label: "In elaborazione", color: "#b45309", bg: "#fef9c3" },
  approved:   { label: "Approvato",       color: "#047857", bg: "#d1fae5" },
  paid:       { label: "Pagato",          color: "#1d4ed8", bg: "#dbeafe" },
  overdue:    { label: "Scaduto",         color: "#b91c1c", bg: "#fee2e2" },
};

// ─── MAIN APP ───────────────────────────────────────────────────────────────

export default function App() {
  const [section, setSection] = useState("dashboard");
  const [brands, setBrands] = useState(DEMO_BRANDS);
  const [invoices, setInvoices] = useState(DEMO_INVOICES);
  const [role, setRole] = useState("manager"); // manager | accountant
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [uploadModal, setUploadModal] = useState(false);
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [toast, setToast] = useState(null);

  // Persist with storage
  useEffect(() => {
    (async () => {
      try {
        const b = await window.storage.get("brands");
        const i = await window.storage.get("invoices");
        if (b) setBrands(JSON.parse(b.value));
        if (i) setInvoices(JSON.parse(i.value));
      } catch {}
    })();
  }, []);

  const saveBrands = async (data) => {
    setBrands(data);
    try { await window.storage.set("brands", JSON.stringify(data)); } catch {}
  };

  const saveInvoices = async (data) => {
    setInvoices(data);
    try { await window.storage.set("invoices", JSON.stringify(data)); } catch {}
  };

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const brand = (id) => brands.find(b => b.id === id) || { name: id, paymentDays: 30 };

  // Stats
  const overdue = invoices.filter(i => urgency(i) === "overdue");
  const dueSoon = invoices.filter(i => ["critical", "soon"].includes(urgency(i)));
  const totalUnpaid = invoices.filter(i => !["paid"].includes(i.status)).reduce((s, i) => s + (i.totalAmount || 0), 0);
  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.totalAmount || 0), 0);

  const filteredInvoices = invoices.filter(i => {
    if (filterBrand !== "all" && i.brandId !== filterBrand) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    return true;
  });

  const nav = [
    { id: "dashboard", icon: "◈", label: "Dashboard" },
    { id: "invoices",  icon: "≡", label: "Fatture" },
    { id: "upload",    icon: "+", label: "Carica PDF" },
    { id: "brands",    icon: "◉", label: "Marchi" },
    { id: "alerts",    icon: "◎", label: "Scadenze" },
  ];

  return (
    <div style={s.app}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sideTop}>
          <div style={s.brand}>
            <div style={s.brandMark}>MG</div>
            <div>
              <div style={s.brandName}>MultiGestione</div>
              <div style={s.brandSub}>Fatture & Pagamenti</div>
            </div>
          </div>

          <div style={s.roleToggle}>
            {["manager", "accountant"].map(r => (
              <button key={r} style={{ ...s.roleBtn, ...(role === r ? s.roleBtnActive : {}) }} onClick={() => setRole(r)}>
                {r === "manager" ? "Manager" : "Contabile"}
              </button>
            ))}
          </div>
        </div>

        <nav style={s.nav}>
          {nav.map(item => (
            <button
              key={item.id}
              style={{ ...s.navItem, ...(section === item.id ? s.navActive : {}) }}
              onClick={() => { setSection(item.id); if (item.id === "upload") setUploadModal(true); }}
            >
              <span style={s.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
              {item.id === "alerts" && (overdue.length + dueSoon.length) > 0 && (
                <span style={s.navBadge}>{overdue.length + dueSoon.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div style={s.sideBottom}>
          <div style={s.overdueBanner}>
            <div style={s.overdueCount}>{overdue.length}</div>
            <div style={s.overdueLabel}>fatture scadute</div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        {/* Top Bar */}
        <div style={s.topbar}>
          <div style={s.pageTitle}>
            {nav.find(n => n.id === section)?.label || "Dashboard"}
          </div>
          <div style={s.topRight}>
            <div style={s.roleIndicator}>
              {role === "manager" ? "👤 Manager" : "📊 Contabile"}
            </div>
            <button style={s.uploadBtn} onClick={() => setUploadModal(true)}>
              + Carica Fattura
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={s.content}>
          {section === "dashboard" && <Dashboard invoices={invoices} brands={brands} brand={brand} urgency={urgency} fmt={fmt} diffDays={diffDays} setSection={setSection} setSelectedInvoice={setSelectedInvoice} saveInvoices={saveInvoices} showToast={showToast} overdue={overdue} dueSoon={dueSoon} totalUnpaid={totalUnpaid} totalPaid={totalPaid} />}
          {section === "invoices" && <InvoiceList invoices={filteredInvoices} brands={brands} brand={brand} urgency={urgency} fmt={fmt} diffDays={diffDays} filterBrand={filterBrand} filterStatus={filterStatus} setFilterBrand={setFilterBrand} setFilterStatus={setFilterStatus} setSelectedInvoice={setSelectedInvoice} saveInvoices={saveInvoices} allInvoices={invoices} role={role} showToast={showToast} />}
          {section === "brands" && <BrandsManager brands={brands} saveBrands={saveBrands} showToast={showToast} />}
          {section === "alerts" && <PaymentAlerts invoices={invoices} brand={brand} fmt={fmt} diffDays={diffDays} urgency={urgency} saveInvoices={saveInvoices} showToast={showToast} setSelectedInvoice={setSelectedInvoice} />}
        </div>
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <InvoiceModal invoice={selectedInvoice} brand={brand(selectedInvoice.brandId)} onClose={() => setSelectedInvoice(null)} saveInvoices={saveInvoices} invoices={invoices} fmt={fmt} role={role} showToast={showToast} />
      )}

      {/* Upload Modal */}
      {uploadModal && (
        <UploadModal brands={brands} brand={brand} onClose={() => { setUploadModal(false); setSection("invoices"); }} saveInvoices={saveInvoices} invoices={invoices} showToast={showToast} />
      )}

      {/* Toast */}
      {toast && (
        <div style={{ ...s.toast, background: toast.type === "ok" ? "#064e3b" : "#7f1d1d" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD ──────────────────────────────────────────────────────────────

function Dashboard({ invoices, brands, brand, urgency, fmt, diffDays, setSection, setSelectedInvoice, saveInvoices, showToast, overdue, dueSoon, totalUnpaid, totalPaid }) {
  const cards = [
    { label: "Da pagare", value: `€ ${fmt(totalUnpaid)}`, sub: `${invoices.filter(i => i.status !== "paid").length} fatture aperte`, accent: "#0f1b2d" },
    { label: "Fatture scadute", value: overdue.length, sub: "Pagamento urgente", accent: "#b91c1c" },
    { label: "In scadenza (15 gg)", value: dueSoon.length, sub: "Attenzione richiesta", accent: "#b45309" },
    { label: "Pagato (totale)", value: `€ ${fmt(totalPaid)}`, sub: `${invoices.filter(i => i.status === "paid").length} fatture saldate`, accent: "#065f46" },
  ];

  const upcoming = [...invoices]
    .filter(i => i.status !== "paid")
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 6);

  return (
    <div>
      <div style={s.cards}>
        {cards.map((c, i) => (
          <div key={i} style={{ ...s.card, borderTop: `3px solid ${c.accent}` }}>
            <div style={s.cardLabel}>{c.label}</div>
            <div style={{ ...s.cardValue, color: c.accent }}>{c.value}</div>
            <div style={s.cardSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.sectionHead}>
          <div style={s.sectionTitle}>Prossime scadenze</div>
          <button style={s.linkBtn} onClick={() => setSection("alerts")}>Vedi tutte →</button>
        </div>
        <div style={s.table}>
          <div style={{ ...s.tableRow, ...s.tableHead }}>
            <span>Marchio</span><span>N. Fattura</span><span>Importo</span><span>Scadenza</span><span>Giorni</span><span>Stato</span>
          </div>
          {upcoming.map(inv => {
            const urg = urgency(inv);
            const days = diffDays(inv.dueDate);
            return (
              <div key={inv.id} style={{ ...s.tableRow, ...s.tableRowHover }} onClick={() => setSelectedInvoice(inv)}>
                <span style={{ fontWeight: 600 }}>{brand(inv.brandId).name}</span>
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{inv.invoiceNumber}</span>
                <span style={{ fontWeight: 600 }}>€ {fmt(inv.totalAmount)}</span>
                <span>{inv.dueDate}</span>
                <span style={{ color: urg === "overdue" ? "#b91c1c" : urg === "critical" ? "#b45309" : "#065f46", fontWeight: 700 }}>
                  {days < 0 ? `${Math.abs(days)}gg scaduta` : days === 0 ? "oggi" : `${days}gg`}
                </span>
                <span><StatusBadge status={inv.status} /></span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── INVOICE LIST ────────────────────────────────────────────────────────────

function InvoiceList({ invoices, brands, brand, urgency, fmt, diffDays, filterBrand, filterStatus, setFilterBrand, setFilterStatus, setSelectedInvoice, saveInvoices, allInvoices, role, showToast }) {
  const exportExcel = () => {
    const rows = [];
    invoices.forEach(inv => {
      const b = brand(inv.brandId);
      inv.items?.forEach(item => {
        rows.push({
          "Marchio": b.name,
          "N. Fattura": inv.invoiceNumber,
          "Data Fattura": inv.invoiceDate,
          "Data Scadenza": inv.dueDate,
          "Dilazione (gg)": b.paymentDays,
          "Articolo (SKU)": item.sku,
          "Descrizione": item.description,
          "Qty": item.qty,
          "U.M.": item.unit,
          "Prezzo Unitario €": item.unitPrice,
          "IVA %": item.vat,
          "Imponibile €": item.subtotal,
          "IVA €": item.vatAmount,
          "Totale €": item.total,
          "Valuta": inv.currency,
          "Stato": STATUS_CONFIG[inv.status]?.label || inv.status,
          "Note": inv.notes,
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(k => ({ wch: k.length + 4 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fatture");
    XLSX.writeFile(wb, `fatture_${new Date().toISOString().split("T")[0]}.xlsx`);
    showToast("✓ Export Excel completato");
  };

  return (
    <div>
      <div style={s.filterBar}>
        <select style={s.select} value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
          <option value="all">Tutti i marchi</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select style={s.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">Tutti gli stati</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={s.count}>{invoices.length} fatture</span>
        {role === "accountant" && (
          <button style={s.exportBtn} onClick={exportExcel}>↓ Esporta Excel</button>
        )}
      </div>

      <div style={s.table}>
        <div style={{ ...s.tableRow, ...s.tableHead }}>
          <span>Marchio</span><span>N. Fattura</span><span>Data</span><span>Scadenza</span><span>Importo</span><span>Stato</span><span>Azioni</span>
        </div>
        {invoices.length === 0 && <div style={s.empty}>Nessuna fattura trovata</div>}
        {invoices.map(inv => {
          const urg = urgency(inv);
          const days = diffDays(inv.dueDate);
          return (
            <div key={inv.id} style={{ ...s.tableRow, borderLeft: urg === "overdue" ? "3px solid #b91c1c" : urg === "critical" ? "3px solid #b45309" : "3px solid transparent" }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{brand(inv.brandId).name}</span>
              <span style={{ fontFamily: "monospace", fontSize: 13 }}>{inv.invoiceNumber}</span>
              <span style={{ fontSize: 13, color: "#64748b" }}>{inv.invoiceDate}</span>
              <span style={{ fontSize: 13, fontWeight: urg !== "ok" && urg !== "paid" ? 700 : 400, color: urg === "overdue" ? "#b91c1c" : urg === "critical" ? "#b45309" : "#374151" }}>
                {inv.dueDate}
                {inv.status !== "paid" && <span style={{ fontSize: 11, marginLeft: 4, color: urg === "overdue" ? "#b91c1c" : "#64748b" }}>
                  ({days < 0 ? `${Math.abs(days)}gg scaduta` : days === 0 ? "oggi" : `+${days}gg`})
                </span>}
              </span>
              <span style={{ fontWeight: 700 }}>€ {fmt(inv.totalAmount)}</span>
              <StatusBadge status={inv.status} />
              <div style={{ display: "flex", gap: 6 }}>
                <button style={s.tblBtn} onClick={() => setSelectedInvoice(inv)}>Dettaglio</button>
                {role === "accountant" && inv.status === "approved" && (
                  <button style={{ ...s.tblBtn, background: "#064e3b", color: "#fff", border: "none" }} onClick={() => {
                    const updated = allInvoices.map(i => i.id === inv.id ? { ...i, status: "paid", notes: i.notes + " | Pagato il " + new Date().toISOString().split("T")[0] } : i);
                    saveInvoices(updated);
                    showToast("✓ Fattura segnata come pagata");
                  }}>Segna pagato</button>
                )}
                {role === "manager" && inv.status === "new" && (
                  <button style={{ ...s.tblBtn, background: "#1e3a5f", color: "#fff", border: "none" }} onClick={() => {
                    const updated = allInvoices.map(i => i.id === inv.id ? { ...i, status: "approved" } : i);
                    saveInvoices(updated);
                    showToast("✓ Fattura approvata");
                  }}>Approva</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PAYMENT ALERTS ─────────────────────────────────────────────────────────

function PaymentAlerts({ invoices, brand, fmt, diffDays, urgency, saveInvoices, showToast, setSelectedInvoice }) {
  const unpaid = invoices
    .filter(i => i.status !== "paid")
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const groups = {
    overdue: unpaid.filter(i => urgency(i) === "overdue"),
    critical: unpaid.filter(i => urgency(i) === "critical"),
    soon: unpaid.filter(i => urgency(i) === "soon"),
    ok: unpaid.filter(i => urgency(i) === "ok"),
  };

  const groupConfig = {
    overdue:  { label: "🔴 Scadute — pagamento immediato", border: "#b91c1c", bg: "#fff5f5" },
    critical: { label: "🟠 Urgenti — scadenza entro 7 giorni", border: "#b45309", bg: "#fffbeb" },
    soon:     { label: "🟡 In scadenza — entro 15 giorni", border: "#ca8a04", bg: "#fefce8" },
    ok:       { label: "🟢 In ordine", border: "#059669", bg: "#f0fdf4" },
  };

  return (
    <div>
      {Object.entries(groups).map(([key, list]) => list.length === 0 ? null : (
        <div key={key} style={{ marginBottom: 28 }}>
          <div style={{ ...s.alertGroupHead, borderLeft: `4px solid ${groupConfig[key].border}`, background: groupConfig[key].bg }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{groupConfig[key].label}</span>
            <span style={{ color: "#64748b", fontSize: 13 }}>{list.length} fatture · € {fmt(list.reduce((a, i) => a + i.totalAmount, 0))}</span>
          </div>
          {list.map(inv => {
            const days = diffDays(inv.dueDate);
            const b = brand(inv.brandId);
            return (
              <div key={inv.id} style={s.alertRow} onClick={() => setSelectedInvoice(inv)}>
                <div style={s.alertBrand}>{b.name}</div>
                <div style={s.alertNum}>{inv.invoiceNumber}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#64748b" }}>Scadenza: <strong style={{ color: days < 0 ? "#b91c1c" : "#374151" }}>{inv.dueDate}</strong></div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>Dilazione: {b.paymentDays} giorni · Contatto: {b.contact}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 17, color: days < 0 ? "#b91c1c" : "#0f1b2d" }}>€ {fmt(inv.totalAmount)}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: days < 0 ? "#b91c1c" : days <= 7 ? "#b45309" : "#b45309" }}>
                  {days < 0 ? `${Math.abs(days)} gg fa` : days === 0 ? "OGGI" : `${days} gg`}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── BRANDS MANAGER ──────────────────────────────────────────────────────────

function BrandsManager({ brands, saveBrands, showToast }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const openEdit = (b) => { setEditing(b?.id || "new"); setForm(b || { id: Date.now().toString(), name: "", category: "", paymentDays: 30, currency: "EUR", contact: "" }); };

  const save = () => {
    const updated = editing === "new" ? [...brands, form] : brands.map(b => b.id === editing ? form : b);
    saveBrands(updated);
    setEditing(null);
    showToast("✓ Marchio salvato");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <button style={s.exportBtn} onClick={() => openEdit(null)}>+ Aggiungi Marchio</button>
      </div>

      <div style={s.brandsGrid}>
        {brands.map(b => (
          <div key={b.id} style={s.brandCard}>
            <div style={s.brandCardTop}>
              <div style={s.brandInitial}>{b.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <div style={s.brandCardName}>{b.name}</div>
                <div style={s.brandCardCat}>{b.category}</div>
              </div>
            </div>
            <div style={s.brandCardBody}>
              <div style={s.brandStat}>
                <span style={s.brandStatLabel}>Dilazione</span>
                <span style={s.brandStatValue}>{b.paymentDays} giorni</span>
              </div>
              <div style={s.brandStat}>
                <span style={s.brandStatLabel}>Valuta</span>
                <span style={s.brandStatValue}>{b.currency}</span>
              </div>
              <div style={s.brandStat}>
                <span style={s.brandStatLabel}>Contatto</span>
                <span style={{ ...s.brandStatValue, fontSize: 12 }}>{b.contact}</span>
              </div>
            </div>
            <button style={s.brandEditBtn} onClick={() => openEdit(b)}>Modifica</button>
          </div>
        ))}
      </div>

      {editing && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHead}>
              <span style={s.modalTitle}>{editing === "new" ? "Nuovo Marchio" : "Modifica Marchio"}</span>
              <button style={s.closeBtn} onClick={() => setEditing(null)}>✕</button>
            </div>
            <div style={s.formGrid}>
              {[
                { key: "name", label: "Nome Marchio" },
                { key: "category", label: "Categoria" },
                { key: "paymentDays", label: "Dilazione (giorni)", type: "number" },
                { key: "currency", label: "Valuta" },
                { key: "contact", label: "Email Contabile" },
              ].map(f => (
                <div key={f.key} style={s.formField}>
                  <label style={s.label}>{f.label}</label>
                  <input
                    style={s.input}
                    type={f.type || "text"}
                    value={form[f.key] || ""}
                    onChange={e => setForm(p => ({ ...p, [f.key]: f.type === "number" ? parseInt(e.target.value) : e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button style={s.cancelBtn} onClick={() => setEditing(null)}>Annulla</button>
              <button style={s.saveBtn} onClick={save}>Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── INVOICE MODAL ──────────────────────────────────────────────────────────

function InvoiceModal({ invoice, brand, onClose, saveInvoices, invoices, fmt, role, showToast }) {
  const [notes, setNotes] = useState(invoice.notes || "");

  const updateStatus = (status) => {
    const updated = invoices.map(i => i.id === invoice.id ? { ...i, status, notes: notes + (status === "paid" ? ` | Pagato il ${new Date().toISOString().split("T")[0]}` : "") } : i);
    saveInvoices(updated);
    showToast("✓ Stato aggiornato");
    onClose();
  };

  const exportThisInvoice = () => {
    const rows = invoice.items?.map(item => ({
      "Marchio": brand.name, "N. Fattura": invoice.invoiceNumber, "Data": invoice.invoiceDate,
      "Scadenza": invoice.dueDate, "SKU": item.sku, "Descrizione": item.description,
      "Qty": item.qty, "U.M.": item.unit, "Prezzo €": item.unitPrice, "IVA %": item.vat,
      "Imponibile €": item.subtotal, "IVA €": item.vatAmount, "Totale €": item.total,
    })) || [];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fattura");
    XLSX.writeFile(wb, `${invoice.invoiceNumber}.xlsx`);
  };

  return (
    <div style={s.modalOverlay}>
      <div style={{ ...s.modal, maxWidth: 760, width: "95vw" }}>
        <div style={s.modalHead}>
          <div>
            <div style={s.modalTitle}>{invoice.invoiceNumber}</div>
            <div style={{ fontSize: 14, color: "#64748b", marginTop: 2 }}>{brand.name} · {brand.paymentDays} giorni di dilazione</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button style={s.exportBtn} onClick={exportThisInvoice}>↓ Excel</button>
            <button style={s.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {[
            ["Data fattura", invoice.invoiceDate],
            ["Scadenza pagamento", invoice.dueDate],
            ["Importo totale", `€ ${fmt(invoice.totalAmount)}`],
            ["Valuta", invoice.currency],
            ["Stato", <StatusBadge status={invoice.status} />],
            ["N. articoli", invoice.items?.length || 0],
          ].map(([k, v]) => (
            <div key={k} style={s.detailField}>
              <div style={s.detailLabel}>{k}</div>
              <div style={s.detailValue}>{v}</div>
            </div>
          ))}
        </div>

        {/* Items Table */}
        <div style={{ marginBottom: 20 }}>
          <div style={s.sectionTitle}>Righe articoli</div>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["SKU", "Descrizione", "Qty", "U.M.", "Prezzo", "IVA%", "Imponibile", "IVA€", "Totale"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#64748b", fontWeight: 600, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.items?.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "9px 10px", fontFamily: "monospace", fontSize: 12, color: "#2563eb" }}>{item.sku}</td>
                    <td style={{ padding: "9px 10px", maxWidth: 200 }}>{item.description}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>{item.qty}</td>
                    <td style={{ padding: "9px 10px" }}>{item.unit}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>€ {fmt(item.unitPrice)}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>{item.vat}%</td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>€ {fmt(item.subtotal)}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>€ {fmt(item.vatAmount)}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700 }}>€ {fmt(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={s.label}>Note</label>
          <textarea style={{ ...s.input, height: 64, resize: "vertical", marginTop: 6 }} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {role === "manager" && invoice.status === "new" && (
            <button style={{ ...s.saveBtn, background: "#1e3a5f" }} onClick={() => updateStatus("approved")}>✓ Approva Fattura</button>
          )}
          {role === "accountant" && invoice.status === "approved" && (
            <button style={{ ...s.saveBtn, background: "#064e3b" }} onClick={() => updateStatus("paid")}>✓ Segna come Pagata</button>
          )}
          {invoice.status === "paid" && (
            <div style={{ color: "#059669", fontWeight: 600, padding: "10px 0" }}>✓ Fattura pagata</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── UPLOAD MODAL ────────────────────────────────────────────────────────────

function UploadModal({ brands, onClose, saveInvoices, invoices, showToast }) {
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(brands[0]?.id || "");
  const inputRef = useRef();

  const handleFiles = async (files) => {
    const pdfs = Array.from(files).filter(f => f.type === "application/pdf");
    if (!pdfs.length) return;
    setProcessing(true);
    for (const file of pdfs) {
      try {
        const base64 = await toBase64(file);
        const extracted = await extractWithAI(base64, selectedBrand, brands);
        setResults(prev => [...prev, { ...extracted, brandId: selectedBrand, id: `inv-${Date.now()}-${Math.random()}`, source: file.name }]);
      } catch (e) {
        setResults(prev => [...prev, { error: e.message, source: file.name }]);
      }
    }
    setProcessing(false);
  };

  const toBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const extractWithAI = async (base64, brandId, brands) => {
    const b = brands.find(br => br.id === brandId) || {};
    const prompt = `Sei un esperto contabile italiano. Estrai TUTTI i dati da questa fattura e rispondi SOLO con JSON valido, senza markdown.

Struttura richiesta:
{
  "invoiceNumber": "numero fattura",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "vendor": "nome fornitore",
  "buyer": "nome acquirente",
  "totalAmount": 0,
  "currency": "EUR",
  "status": "new",
  "notes": "",
  "items": [
    {
      "sku": "codice articolo",
      "description": "descrizione prodotto",
      "qty": 1,
      "unit": "pz",
      "unitPrice": 0,
      "vat": 22,
      "subtotal": 0,
      "vatAmount": 0,
      "total": 0
    }
  ]
}

Se la data di scadenza non è indicata, calcolala aggiungendo ${b.paymentDays || 30} giorni alla data fattura.
Rispondi SOLO con il JSON.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });
    const data = await res.json();
    const text = data.content?.find(b => b.type === "text")?.text || "{}";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  };

  const saveAll = () => {
    const valid = results.filter(r => !r.error);
    saveInvoices([...invoices, ...valid]);
    showToast(`✓ ${valid.length} fatture salvate`);
    onClose();
  };

  return (
    <div style={s.modalOverlay}>
      <div style={{ ...s.modal, maxWidth: 640 }}>
        <div style={s.modalHead}>
          <span style={s.modalTitle}>Carica Fatture PDF</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.formField}>
          <label style={s.label}>Marchio fornitore</label>
          <select style={{ ...s.input, marginTop: 6 }} value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)}>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name} ({b.paymentDays} gg dilazione)</option>)}
          </select>
        </div>

        <div
          style={{ ...s.dropZone, ...(dragging ? s.dropActive : {}) }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" multiple accept=".pdf" style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
          {processing ? (
            <div style={{ textAlign: "center" }}>
              <div style={s.spinnerDark} />
              <div style={{ marginTop: 12, color: "#374151", fontWeight: 600 }}>Claude sta leggendo le fatture...</div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>Estrazione articoli, importi, IVA...</div>
            </div>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📄</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#0f1b2d" }}>Trascina qui le fatture PDF</div>
              <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 4 }}>oppure clicca per selezionare</div>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {results.map((r, i) => (
              <div key={i} style={s.resultRow}>
                <span style={{ fontSize: 18 }}>{r.error ? "✗" : "✓"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{r.source}</div>
                  {r.error ? (
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>{r.error}</div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {r.invoiceNumber} · {r.items?.length || 0} articoli · € {r.totalAmount?.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <button style={{ ...s.saveBtn, width: "100%", marginTop: 16 }} onClick={saveAll}>
              Salva {results.filter(r => !r.error).length} fatture →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STATUS BADGE ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: "#64748b", bg: "#f1f5f9" };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = {
  app: { display: "flex", height: "100vh", background: "#f8f9fb", fontFamily: "'Georgia', 'Times New Roman', serif", overflow: "hidden" },
  sidebar: { width: 240, background: "#0f1b2d", display: "flex", flexDirection: "column", flexShrink: 0 },
  sideTop: { padding: "24px 20px 20px" },
  brand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 },
  brandMark: { width: 36, height: 36, background: "#c8a96e", color: "#0f1b2d", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, borderRadius: 4, fontSize: 14 },
  brandName: { fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" },
  brandSub: { fontSize: 11, color: "#64748b", marginTop: 1 },
  roleToggle: { display: "flex", background: "#1e2d3f", borderRadius: 6, padding: 3, gap: 3 },
  roleBtn: { flex: 1, padding: "6px 0", fontSize: 12, background: "transparent", border: "none", color: "#64748b", cursor: "pointer", borderRadius: 4, fontFamily: "inherit", transition: "all 0.2s" },
  roleBtnActive: { background: "#c8a96e", color: "#0f1b2d", fontWeight: 700 },
  nav: { flex: 1, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2 },
  navItem: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", borderRadius: 6, width: "100%", textAlign: "left", fontSize: 14, fontFamily: "inherit", transition: "all 0.15s", position: "relative" },
  navActive: { background: "#1e2d3f", color: "#c8a96e" },
  navIcon: { fontSize: 16, width: 18, textAlign: "center" },
  navBadge: { marginLeft: "auto", background: "#b91c1c", color: "#fff", fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 20 },
  sideBottom: { padding: "16px 20px" },
  overdueBanner: { background: "rgba(185,28,28,0.15)", border: "1px solid rgba(185,28,28,0.3)", borderRadius: 8, padding: "12px 16px", textAlign: "center" },
  overdueCount: { fontSize: 28, fontWeight: 800, color: "#fca5a5" },
  overdueLabel: { fontSize: 11, color: "#f87171", marginTop: 2 },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar: { background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 28px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  pageTitle: { fontSize: 18, fontWeight: 700, color: "#0f1b2d", letterSpacing: "-0.3px" },
  topRight: { display: "flex", alignItems: "center", gap: 14 },
  roleIndicator: { fontSize: 13, color: "#64748b", background: "#f8fafc", padding: "6px 14px", borderRadius: 6, border: "1px solid #e2e8f0" },
  uploadBtn: { background: "#0f1b2d", color: "#c8a96e", border: "none", padding: "9px 20px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit", letterSpacing: "-0.2px" },
  content: { flex: 1, overflow: "auto", padding: 28 },
  cards: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 },
  card: { background: "#fff", padding: "20px 22px", borderRadius: 8, border: "1px solid #e2e8f0" },
  cardLabel: { fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 },
  cardValue: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 4 },
  cardSub: { fontSize: 12, color: "#94a3b8" },
  section: { background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #f1f5f9" },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "#0f1b2d", letterSpacing: "-0.2px" },
  linkBtn: { background: "none", border: "none", color: "#c8a96e", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit" },
  table: { background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" },
  tableHead: { background: "#f8fafc !important", fontWeight: 600, fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px" },
  tableRow: { display: "grid", gridTemplateColumns: "1.5fr 1.2fr 0.8fr 1fr 0.9fr 1fr", gap: 16, padding: "12px 20px", borderBottom: "1px solid #f1f5f9", alignItems: "center", cursor: "pointer", background: "#fff" },
  tableRowHover: {},
  filterBar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  select: { padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#374151", cursor: "pointer" },
  count: { fontSize: 13, color: "#94a3b8" },
  exportBtn: { background: "#0f1b2d", color: "#c8a96e", border: "none", padding: "9px 18px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit" },
  empty: { padding: "40px 20px", textAlign: "center", color: "#94a3b8" },
  tblBtn: { padding: "5px 12px", borderRadius: 4, border: "1px solid #e2e8f0", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 12, fontFamily: "inherit", whiteSpace: "nowrap" },
  alertGroupHead: { padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, borderRadius: 6 },
  alertRow: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "14px 18px", marginBottom: 6, display: "flex", alignItems: "center", gap: 16, cursor: "pointer" },
  alertBrand: { fontWeight: 700, fontSize: 14, color: "#0f1b2d", minWidth: 150 },
  alertNum: { fontFamily: "monospace", fontSize: 13, color: "#2563eb", minWidth: 130 },
  brandsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 },
  brandCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 },
  brandCardTop: { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 },
  brandInitial: { width: 40, height: 40, background: "#0f1b2d", color: "#c8a96e", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, borderRadius: 6, fontSize: 14, flexShrink: 0 },
  brandCardName: { fontWeight: 700, fontSize: 15, color: "#0f1b2d" },
  brandCardCat: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  brandCardBody: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 },
  brandStat: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  brandStatLabel: { fontSize: 12, color: "#94a3b8" },
  brandStatValue: { fontSize: 13, fontWeight: 600, color: "#374151" },
  brandEditBtn: { width: "100%", padding: "8px 0", background: "transparent", border: "1px solid #e2e8f0", borderRadius: 6, color: "#374151", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(15,27,45,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 },
  modal: { background: "#fff", borderRadius: 10, padding: 28, maxHeight: "90vh", overflowY: "auto", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 800, color: "#0f1b2d", letterSpacing: "-0.4px" },
  closeBtn: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8", lineHeight: 1 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  formField: { display: "flex", flexDirection: "column" },
  label: { fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 },
  input: { padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14, fontFamily: "inherit", color: "#0f1b2d", outline: "none" },
  cancelBtn: { padding: "10px 20px", background: "#f1f5f9", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontFamily: "inherit", fontWeight: 600 },
  saveBtn: { padding: "10px 24px", background: "#0f1b2d", color: "#c8a96e", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontFamily: "inherit", fontWeight: 700 },
  detailField: { background: "#f8fafc", padding: "12px 14px", borderRadius: 6 },
  detailLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 },
  detailValue: { fontSize: 15, fontWeight: 700, color: "#0f1b2d" },
  dropZone: { border: "2px dashed #e2e8f0", borderRadius: 8, padding: "40px 20px", textAlign: "center", cursor: "pointer", margin: "16px 0", transition: "all 0.2s" },
  dropActive: { borderColor: "#c8a96e", background: "#fffdf7" },
  resultRow: { display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid #f1f5f9" },
  spinnerDark: { width: 24, height: 24, border: "2px solid #e2e8f0", borderTop: "2px solid #0f1b2d", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" },
  toast: { position: "fixed", bottom: 24, right: 24, color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)", fontFamily: "inherit" },
};
