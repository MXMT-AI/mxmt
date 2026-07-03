import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

// ═══════════════════════════════════════════════════════════════════════════
// DEMO DATA
// ═══════════════════════════════════════════════════════════════════════════

const DEMO_BRANDS = [
  { id: "prada", name: "Prada", budget: 50000, spent: 0, currency: "EUR", paymentDays: 60 },
  { id: "gucci", name: "Gucci", budget: 60000, spent: 0, currency: "EUR", paymentDays: 90 },
  { id: "valentino", name: "Valentino", budget: 35000, spent: 0, currency: "EUR", paymentDays: 30 },
  { id: "marni", name: "Marni", budget: 28000, spent: 0, currency: "EUR", paymentDays: 45 },
  { id: "bottega", name: "Bottega Veneta", budget: 40000, spent: 0, currency: "EUR", paymentDays: 60 },
];

const DEMO_CATALOGS = [
  {
    id: "prada-ss25",
    brandId: "prada",
    season: "SS25",
    uploadedAt: new Date(Date.now() - 3600000).toISOString().split("T")[0],
    items: [
      { sku: "PR-SH-001", name: "White Cotton T-Shirt", category: "Tops", color: "White", style: "Basic", material: "Cotton", price: 180, costPrice: 60, minOrder: 10, stock: 200, leadTime: 21, margin: "67%", tags: ["essential", "basics", "summer"] },
      { sku: "PR-SH-002", name: "Navy Cotton T-Shirt", category: "Tops", color: "Navy", style: "Basic", material: "Cotton", price: 180, costPrice: 60, minOrder: 10, stock: 180, leadTime: 21, margin: "67%", tags: ["essential", "basics"] },
      { sku: "PR-DN-101", name: "Slim Navy Denim", category: "Denim", color: "Navy", style: "Slim Fit", material: "Denim", price: 350, costPrice: 120, minOrder: 5, stock: 150, leadTime: 28, margin: "66%", tags: ["classic", "staple"] },
      { sku: "PR-JK-201", name: "Leather Jacket Black", category: "Jackets", color: "Black", style: "Classic", material: "Leather", price: 1200, costPrice: 450, minOrder: 3, stock: 40, leadTime: 35, margin: "62%", tags: ["luxury", "statement"] },
    ]
  },
  {
    id: "gucci-ss25",
    brandId: "gucci",
    season: "SS25",
    uploadedAt: new Date(Date.now() - 7200000).toISOString().split("T")[0],
    items: [
      { sku: "GU-SH-050", name: "White Stripe T-Shirt", category: "Tops", color: "White", style: "Striped", material: "Cotton", price: 250, costPrice: 80, minOrder: 8, stock: 220, leadTime: 25, margin: "68%", tags: ["casual", "summer", "striped"] },
      { sku: "GU-DN-150", name: "Navy Slim Denim", category: "Denim", color: "Navy", style: "Slim Fit", material: "Denim", price: 380, costPrice: 130, minOrder: 5, stock: 160, leadTime: 30, margin: "66%", tags: ["classic", "staple"] },
      { sku: "GU-DN-151", name: "Black Slim Denim", category: "Denim", color: "Black", style: "Slim Fit", material: "Denim", price: 380, costPrice: 130, minOrder: 5, stock: 140, leadTime: 30, margin: "66%", tags: ["classic", "staple"] },
      { sku: "GU-BG-300", name: "Shoulder Bag", category: "Bags", color: "Tan", style: "Classic", material: "Leather", price: 890, costPrice: 280, minOrder: 4, stock: 80, leadTime: 28, margin: "69%", tags: ["luxury", "leather"] },
    ]
  },
  {
    id: "valentino-ss25",
    brandId: "valentino",
    season: "SS25",
    uploadedAt: new Date(Date.now() - 10800000).toISOString().split("T")[0],
    items: [
      { sku: "VA-SH-020", name: "Red Cotton T-Shirt", category: "Tops", color: "Red", style: "Basic", material: "Cotton", price: 220, costPrice: 70, minOrder: 10, stock: 190, leadTime: 22, margin: "68%", tags: ["colorful", "statement", "summer"] },
      { sku: "VA-DN-200", name: "Red Denim", category: "Denim", color: "Red", style: "Slim Fit", material: "Denim", price: 420, costPrice: 140, minOrder: 5, stock: 120, leadTime: 32, margin: "67%", tags: ["statement", "colorful", "trend"] },
    ]
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════

export default function AssortmentPlanner() {
  const [section, setSection] = useState("dashboard");
  const [brands, setBrands] = useState(DEMO_BRANDS);
  const [catalogs, setCatalogs] = useState(DEMO_CATALOGS);
  const [allItems, setAllItems] = useState(() => DEMO_CATALOGS.flatMap(c => c.items.map(i => ({ ...i, catalogId: c.id, brandId: c.brandId }))));
  const [cart, setCart] = useState([]);
  const [aiChat, setAiChat] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [selectedBrandUpload, setSelectedBrandUpload] = useState(brands[0]?.id);
  const [similarGroups, setSimilarGroups] = useState([]);
  const [toast, setToast] = useState(null);

  // Load from storage
  useEffect(() => {
    (async () => {
      try {
        const stored = await window.storage.get("assortment-data");
        if (stored) {
          const data = JSON.parse(stored.value);
          setBrands(data.brands || DEMO_BRANDS);
          setCatalogs(data.catalogs || DEMO_CATALOGS);
          setCart(data.cart || []);
        }
      } catch {}
    })();
  }, []);

  // Save to storage
  const saveData = async (newBrands, newCatalogs, newCart) => {
    try {
      await window.storage.set("assortment-data", JSON.stringify({ brands: newBrands, catalogs: newCatalogs, cart: newCart }));
    } catch {}
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // AI Assistant
  const sendToAI = async () => {
    if (!aiInput.trim()) return;

    const userMsg = { role: "user", content: aiInput };
    setAiChat(prev => [...prev, userMsg]);
    setAiInput("");
    setAiLoading(true);

    try {
      const catalogSummary = catalogs.map(c => {
        const b = brands.find(br => br.id === c.brandId);
        const spent = cart.filter(ci => ci.brandId === c.brandId).reduce((s, ci) => s + (ci.price * ci.selectedQty), 0);
        return `${b.name}: ${c.items.length} items, budget €${b.budget}, spent €${spent.toFixed(0)}, remaining €${(b.budget - spent).toFixed(0)}`;
      }).join("\n");

      const cartSummary = cart.length > 0 ? cart.map(i => `${i.name} (${i.sku}) x${i.selectedQty} @ €${i.price}`).join("\n") : "Корзина пуста";

      const prompt = `Ты — умный AI ассистент для закупок моды в мультибренд компанию в Италии.

ТЕКУЩИЙ АССОРТИМЕНТ:
${catalogSummary}

ТЕКУЩАЯ КОРЗИНА:
${cartSummary}

ЗАДАЧА ПОЛЬЗОВАТЕЛЯ:
${aiInput}

Помоги с:
- Рекомендациями что закупить исходя из бюджета
- Обнаружением дублей (если заказывает похожее у разных брендов)
- Оптимизацией ассортимента (как распределить деньги)
- Анализом маржи и оборачиваемости

Ответь кратко, конкретно, с рекомендациями.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await response.json();
      const assistantMsg = {
        role: "assistant",
        content: data.content?.[0]?.text || "Ошибка при ответе"
      };
      setAiChat(prev => [...prev, assistantMsg]);
    } catch (e) {
      setAiChat(prev => [...prev, { role: "assistant", content: `Ошибка: ${e.message}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  // Upload catalog
  const handleCatalogUpload = async (file, brandId) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);

      const season = prompt("Введи сезон (например, SS25, AW25):", "SS25") || "SS25";

      const newItems = data.map(row => ({
        sku: row["SKU"] || row["sku"] || "",
        name: row["Name"] || row["name"] || "",
        category: row["Category"] || row["category"] || "Other",
        color: row["Color"] || row["color"] || "",
        style: row["Style"] || row["style"] || "",
        material: row["Material"] || row["material"] || "",
        price: parseFloat(row["Price"] || row["price"] || 0),
        costPrice: parseFloat(row["Cost"] || row["cost"] || 0),
        minOrder: parseInt(row["MinOrder"] || row["minOrder"] || 1),
        stock: parseInt(row["Stock"] || row["stock"] || 0),
        leadTime: parseInt(row["Lead Time"] || row["leadTime"] || 28),
        tags: row["Tags"]?.split(",").map(t => t.trim()) || []
      }));

      const newCatalog = {
        id: `${brandId}-${season}-${Date.now()}`,
        brandId,
        season,
        uploadedAt: new Date().toISOString().split("T")[0],
        items: newItems
      };

      const updatedCatalogs = [...catalogs, newCatalog];
      const updatedAllItems = updatedCatalogs.flatMap(c => c.items.map(i => ({ ...i, catalogId: c.id, brandId: c.brandId })));

      setCatalogs(updatedCatalogs);
      setAllItems(updatedAllItems);
      saveData(brands, updatedCatalogs, cart);
      showToast(`✓ Загружено ${newItems.length} товаров от ${brands.find(b => b.id === brandId)?.name}`);
      setUploadModal(false);
    } catch (e) {
      showToast(`✗ Ошибка: ${e.message}`);
    }
  };

  // Find duplicates
  const findDuplicates = () => {
    const groups = {};
    allItems.forEach(item => {
      const key = `${item.category}-${item.color}-${item.style}`.toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const dupes = Object.values(groups).filter(g => g.length > 1);
    setSimilarGroups(dupes);
    showToast(`Найдено ${dupes.length} групп дублей`);
  };

  // Add to cart
  const addToCart = (item, qty) => {
    const existing = cart.find(c => c.sku === item.sku);
    let newCart;
    if (existing) {
      newCart = cart.map(c => c.sku === item.sku ? { ...c, selectedQty: c.selectedQty + qty } : c);
    } else {
      newCart = [...cart, { ...item, selectedQty: qty, addedAt: new Date().toISOString() }];
    }
    setCart(newCart);
    saveData(brands, catalogs, newCart);
    showToast(`✓ ${item.name} добавлен в корзину`);
  };

  // Budget tracking
  const budgetStatus = brands.map(b => {
    const spent = cart.filter(c => c.brandId === b.id).reduce((s, c) => s + (c.price * c.selectedQty), 0);
    return { ...b, spent, remaining: b.budget - spent, percentage: Math.round((spent / b.budget) * 100) };
  });

  const totalBudget = budgetStatus.reduce((s, b) => s + b.budget, 0);
  const totalSpent = budgetStatus.reduce((s, b) => s + b.spent, 0);
  const totalItems = cart.reduce((s, c) => s + c.selectedQty, 0);

  // Dashboard metrics
  const categories = {};
  allItems.forEach(item => {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push(item);
  });

  return (
    <div style={s.app}>
      {/* SIDEBAR */}
      <div style={s.sidebar}>
        <div style={s.logo}>ASSORT 🎨</div>
        <nav style={s.nav}>
          {[
            { id: "dashboard", label: "Dashboard", icon: "◈" },
            { id: "catalogs", label: "Каталоги", icon: "📦" },
            { id: "duplicates", label: "Дубли", icon: "⚠️" },
            { id: "cart", label: "Заказ", icon: `🛒 (${totalItems})` },
            { id: "ai", label: "AI助手", icon: "✨" },
            { id: "budgets", label: "Бюджеты", icon: "💰" },
          ].map(item => (
            <button
              key={item.id}
              style={{ ...s.navBtn, ...(section === item.id ? s.navBtnActive : {}) }}
              onClick={() => setSection(item.id)}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* MAIN */}
      <div style={s.main}>
        {/* TOPBAR */}
        <div style={s.topbar}>
          <div style={s.topLeft}>
            <h1 style={s.pageTitle}>
              {{
                dashboard: "Обзор ассортимента",
                catalogs: "Каталоги брендов",
                duplicates: "Анализ дублей",
                cart: "Корзина заказа",
                ai: "AI Ассистент",
                budgets: "Управление бюджетом"
              }[section]}
            </h1>
          </div>
          <div style={s.topRight}>
            <div style={s.budgetQuick}>€{fmt(totalBudget)} / €{fmt(totalSpent)} ({Math.round((totalSpent / totalBudget) * 100)}%)</div>
            {section === "catalogs" && (
              <button style={s.uploadBtnTop} onClick={() => setUploadModal(true)}>+ Upload</button>
            )}
            {section === "duplicates" && (
              <button style={s.uploadBtnTop} onClick={findDuplicates}>🔍 Найти дубли</button>
            )}
          </div>
        </div>

        {/* CONTENT */}
        <div style={s.content}>
          {section === "dashboard" && <Dashboard brands={brands} catalogs={catalogs} categories={categories} budgetStatus={budgetStatus} fmt={fmt} cart={cart} />}
          {section === "catalogs" && <CatalogsView brands={brands} catalogs={catalogs} allItems={allItems} addToCart={addToCart} />}
          {section === "duplicates" && <DuplicatesView similarGroups={similarGroups} fmt={fmt} addToCart={addToCart} />}
          {section === "cart" && <CartView cart={cart} setCart={(newCart) => { setCart(newCart); saveData(brands, catalogs, newCart); }} budgetStatus={budgetStatus} fmt={fmt} />}
          {section === "ai" && <AIAssistant aiChat={aiChat} aiInput={aiInput} setAiInput={setAiInput} sendToAI={sendToAI} aiLoading={aiLoading} />}
          {section === "budgets" && <BudgetsView budgetStatus={budgetStatus} fmt={fmt} />}
        </div>
      </div>

      {/* UPLOAD MODAL */}
      {uploadModal && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <h2 style={s.modalTitle}>Загрузить каталог CSV/Excel</h2>
            <p style={s.modalHint}>Формат: SKU, Name, Category, Color, Style, Material, Price, Cost, MinOrder, Stock, Lead Time</p>

            <select style={s.select} value={selectedBrandUpload} onChange={e => setSelectedBrandUpload(e.target.value)}>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>

            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={e => {
                if (e.target.files[0]) {
                  handleCatalogUpload(e.target.files[0], selectedBrandUpload);
                }
              }}
              style={s.fileInput}
            />

            <button style={s.cancelBtn} onClick={() => setUploadModal(false)}>Закрыть</button>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════════════════════════════════════

function Dashboard({ brands, catalogs, categories, budgetStatus, fmt, cart }) {
  return (
    <div>
      {/* METRICS */}
      <div style={s.metricsGrid}>
        <MetricCard label="Брендов" value={brands.length} detail={catalogs.length + " каталогов"} />
        <MetricCard label="Товаров" value={Object.values(categories).flat().length} detail={Object.keys(categories).length + " категорий"} />
        <MetricCard label="В корзине" value={cart.length} detail={cart.reduce((s, c) => s + c.selectedQty, 0) + " единиц"} />
        <MetricCard label="Бюджет" value={`€${fmt(budgetStatus.reduce((s, b) => s + b.spent, 0))} / ${fmt(budgetStatus.reduce((s, b) => s + b.budget, 0))}`} detail={Math.round((budgetStatus.reduce((s, b) => s + b.spent, 0) / budgetStatus.reduce((s, b) => s + b.budget, 0)) * 100) + "%"} />
      </div>

      {/* BUDGET STATUS */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Статус бюджетов по брендам</h2>
        {budgetStatus.map(b => (
          <div key={b.id} style={s.budgetRow}>
            <div style={s.brandName}>{b.name}</div>
            <div style={s.budgetBar}>
              <div style={{ ...s.budgetFill, width: Math.min(b.percentage, 100) + "%" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>€{fmt(b.spent)} / €{fmt(b.budget)}</span>
            <span style={{ fontSize: 12, color: b.percentage > 100 ? "#dc2626" : "#64748b" }}>{b.percentage}%</span>
          </div>
        ))}
      </div>

      {/* TOP CATEGORIES */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Категории товаров</h2>
        <div style={s.categoriesGrid}>
          {Object.entries(categories).map(([cat, items]) => (
            <div key={cat} style={s.categoryCard}>
              <div style={s.categoryName}>{cat}</div>
              <div style={s.categoryValue}>{items.length} товаров</div>
              <div style={s.categorySubtext}>от {items.length > 0 ? items.length : 0} брендов</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CatalogsView({ brands, catalogs, allItems, addToCart }) {
  const [filter, setFilter] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("all");

  const filtered = allItems.filter(item => {
    if (selectedBrand !== "all" && item.brandId !== selectedBrand) return false;
    if (filter && !item.name.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={s.filterBar}>
        <select style={s.select} value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)}>
          <option value="all">Все бренды</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input style={s.input} type="text" placeholder="Поиск..." value={filter} onChange={e => setFilter(e.target.value)} />
      </div>

      <div style={s.itemsGrid}>
        {filtered.map(item => (
          <div key={item.sku} style={s.itemCard}>
            <div style={s.itemHead}>
              <span style={s.itemSku}>{item.sku}</span>
              <span style={s.itemMargin}>{Math.round(((item.price - item.costPrice) / item.price) * 100)}%</span>
            </div>
            <div style={s.itemName}>{item.name}</div>
            <div style={s.itemMeta}>
              <span>{item.color}</span> · <span>{item.category}</span>
            </div>
            <div style={s.itemPrice}>€{item.price}</div>
            <div style={s.itemTags}>
              {item.tags?.slice(0, 2).map((tag, i) => <span key={i} style={s.tag}>{tag}</span>)}
            </div>
            <div style={s.itemFooter}>
              <span style={{ fontSize: 12, color: "#64748b" }}>{item.stock} шт</span>
              <input
                type="number"
                min="1"
                max={item.minOrder * 10}
                defaultValue={item.minOrder}
                style={s.qtyInput}
                id={`qty-${item.sku}`}
              />
              <button
                style={s.addBtn}
                onClick={() => {
                  const qty = parseInt(document.getElementById(`qty-${item.sku}`).value);
                  addToCart(item, qty);
                }}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DuplicatesView({ similarGroups, fmt, addToCart }) {
  if (similarGroups.length === 0) {
    return <div style={s.empty}>Дублей не найдено. Нажми "🔍 Найти дубли" чтобы отсканировать.</div>;
  }

  return (
    <div>
      {similarGroups.map((group, i) => (
        <div key={i} style={s.dupeGroup}>
          <div style={s.dupeHeader}>
            <h3>{group[0].category} — {group[0].color} {group[0].style}</h3>
            <span style={s.dupeCount}>{group.length} похожих товаров</span>
          </div>
          <div style={s.dupeItems}>
            {group.map(item => (
              <div key={item.sku} style={s.dupeItem}>
                <div style={s.dupeItemHead}>
                  <strong>{item.name}</strong>
                  <span style={s.dupePrice}>€{item.price}</span>
                </div>
                <div style={s.dupeItemSub}>
                  <span style={{ color: "#2563eb", fontWeight: 600 }}>{item.sku}</span>
                  <span>Margin: {Math.round(((item.price - item.costPrice) / item.price) * 100)}%</span>
                  <span>{item.stock} в наличии</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input type="number" min="1" defaultValue={item.minOrder} style={s.qtyInput} id={`dupe-qty-${item.sku}`} />
                  <button style={s.addBtn} onClick={() => {
                    const qty = parseInt(document.getElementById(`dupe-qty-${item.sku}`).value);
                    addToCart(item, qty);
                  }}>Добавить</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CartView({ cart, setCart, budgetStatus, fmt }) {
  const removeFromCart = (sku) => {
    setCart(cart.filter(c => c.sku !== sku));
  };

  const updateQty = (sku, qty) => {
    if (qty <= 0) removeFromCart(sku);
    else setCart(cart.map(c => c.sku === sku ? { ...c, selectedQty: qty } : c));
  };

  const cartByBrand = {};
  cart.forEach(item => {
    if (!cartByBrand[item.brandId]) cartByBrand[item.brandId] = [];
    cartByBrand[item.brandId].push(item);
  });

  const exportPO = () => {
    const data = cart.map(c => ({
      "Бренд": budgetStatus.find(b => b.id === c.brandId)?.name || c.brandId,
      "SKU": c.sku,
      "Товар": c.name,
      "Количество": c.selectedQty,
      "Цена €": c.price,
      "Сумма €": c.price * c.selectedQty,
      "Margin %": Math.round(((c.price - c.costPrice) / c.price) * 100)
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] || {}).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PO");
    XLSX.writeFile(wb, `PO-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div>
      {Object.entries(cartByBrand).map(([brandId, items]) => {
        const b = budgetStatus.find(bs => bs.id === brandId);
        const subtotal = items.reduce((s, i) => s + (i.price * i.selectedQty), 0);
        const available = b.remaining;
        return (
          <div key={brandId} style={{ ...s.section, marginBottom: 24 }}>
            <h3 style={s.sectionTitle}>{b.name}</h3>
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <span>Сумма: <strong>€{fmt(subtotal)}</strong></span>
              <span style={{ color: available < 0 ? "#dc2626" : "#059669" }}>
                Осталось: <strong>€{fmt(available)}</strong>
              </span>
            </div>
            {items.map(item => (
              <div key={item.sku} style={s.cartItem}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{item.sku}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="number"
                    min="1"
                    value={item.selectedQty}
                    onChange={e => updateQty(item.sku, parseInt(e.target.value))}
                    style={s.qtyInput}
                  />
                  <div style={{ fontWeight: 700, minWidth: 80 }}>€{fmt(item.price * item.selectedQty)}</div>
                  <button style={s.deleteBtn} onClick={() => removeFromCart(item.sku)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {cart.length > 0 && (
        <div style={{ textAlign: "right", marginTop: 20 }}>
          <button style={s.exportBtn} onClick={exportPO}>↓ Экспорт PO</button>
        </div>
      )}
      {cart.length === 0 && <div style={s.empty}>Корзина пуста</div>}
    </div>
  );
}

function AIAssistant({ aiChat, aiInput, setAiInput, sendToAI, aiLoading }) {
  const chatRef = useRef();
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [aiChat]);

  return (
    <div style={s.aiContainer}>
      <div style={s.aiChat} ref={chatRef}>
        {aiChat.length === 0 && (
          <div style={s.aiEmpty}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
            <div>Я помогу тебе с ассортиментом</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>
              Спроси меня про:
              <br />• Какой товар закупить <br />• Где дубли <br />• Как распределить бюджет <br />• Оптимизацию ассортимента
            </div>
          </div>
        )}
        {aiChat.map((msg, i) => (
          <div key={i} style={{ ...s.aiMsg, ...(msg.role === "user" ? s.aiMsgUser : s.aiMsgAssistant) }}>
            {msg.content}
          </div>
        ))}
        {aiLoading && <div style={{ ...s.aiMsg, ...s.aiMsgAssistant, fontStyle: "italic", color: "#64748b" }}>Думаю...</div>}
      </div>
      <div style={s.aiInput}>
        <input
          style={s.aiInputField}
          value={aiInput}
          onChange={e => setAiInput(e.target.value)}
          onKeyPress={e => e.key === "Enter" && !aiLoading && sendToAI()}
          placeholder="Спроси что угодно об ассортименте..."
          disabled={aiLoading}
        />
        <button style={s.aiSendBtn} onClick={sendToAI} disabled={aiLoading}>
          {aiLoading ? "..." : "→"}
        </button>
      </div>
    </div>
  );
}

function BudgetsView({ budgetStatus, fmt }) {
  return (
    <div>
      <div style={s.metricsGrid}>
        <MetricCard label="Общий бюджет" value={`€${fmt(budgetStatus.reduce((s, b) => s + b.budget, 0))}`} detail={`Потрачено: €${fmt(budgetStatus.reduce((s, b) => s + b.spent, 0))}`} />
        <MetricCard label="Использовано" value={`${Math.round((budgetStatus.reduce((s, b) => s + b.spent, 0) / budgetStatus.reduce((s, b) => s + b.budget, 0)) * 100)}%`} detail="от общего бюджета" />
      </div>

      {budgetStatus.map(b => (
        <div key={b.id} style={s.budgetDetailCard}>
          <div style={s.budgetCardHead}>
            <h3>{b.name}</h3>
            <span style={{ fontSize: 20, fontWeight: 800, color: b.percentage > 100 ? "#dc2626" : "#059669" }}>
              {b.percentage}%
            </span>
          </div>
          <div style={s.budgetBar}>
            <div style={{ ...s.budgetFill, width: Math.min(b.percentage, 100) + "%", background: b.percentage > 100 ? "#dc2626" : "#059669" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Лимит</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>€{fmt(b.budget)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Потрачено</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: "#059669" }}>€{fmt(b.spent)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Осталось</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: b.remaining < 0 ? "#dc2626" : "#0f172a" }}>€{fmt(b.remaining)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, detail }) {
  return (
    <div style={s.metricCard}>
      <div style={s.metricLabel}>{label}</div>
      <div style={s.metricValue}>{value}</div>
      <div style={s.metricDetail}>{detail}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILS & STYLES
// ═══════════════════════════════════════════════════════════════════════════

const fmt = (n) => Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const s = {
  app: { display: "flex", height: "100vh", background: "#f8f9fa", fontFamily: "'Georgia', system-ui, sans-serif", overflow: "hidden" },
  sidebar: { width: 200, background: "#1a2332", color: "#fff", display: "flex", flexDirection: "column", padding: "20px 0", flexShrink: 0 },
  logo: { fontSize: 18, fontWeight: 800, padding: "0 20px", marginBottom: 20, letterSpacing: "-1px" },
  nav: { flex: 1, display: "flex", flexDirection: "column", gap: 2, padding: "0 12px" },
  navBtn: { background: "transparent", border: "none", color: "#94a3b8", padding: "10px 12px", borderRadius: 6, cursor: "pointer", fontSize: 14, fontFamily: "inherit", textAlign: "left", transition: "all 0.2s" },
  navBtnActive: { background: "#1a5f5f", color: "#fff", fontWeight: 700 },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar: { background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 24px", height: 60, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 },
  topLeft: { flex: 1 },
  pageTitle: { margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.5px" },
  topRight: { display: "flex", alignItems: "center", gap: 16 },
  budgetQuick: { fontSize: 13, fontWeight: 600, background: "#f3f4f6", padding: "6px 12px", borderRadius: 6, color: "#374151" },
  uploadBtnTop: { background: "#1a5f5f", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit" },
  content: { flex: 1, overflow: "auto", padding: 24 },
  metricsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 },
  metricCard: { background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #e5e7eb" },
  metricLabel: { fontSize: 12, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" },
  metricValue: { fontSize: 28, fontWeight: 800, color: "#1a5f5f", marginTop: 4, letterSpacing: "-1px" },
  metricDetail: { fontSize: 12, color: "#9ca3af", marginTop: 4 },
  section: { background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", padding: 20, marginBottom: 24 },
  sectionTitle: { margin: "0 0 16px 0", fontSize: 16, fontWeight: 700, color: "#0f172a" },
  budgetRow: { display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: "1px solid #f3f4f6" },
  brandName: { minWidth: 140, fontWeight: 600, color: "#0f172a" },
  budgetBar: { flex: 1, height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" },
  budgetFill: { height: "100%", background: "#1a5f5f", transition: "width 0.3s" },
  categoriesGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 },
  categoryCard: { background: "#f9fafb", padding: 16, borderRadius: 8, border: "1px solid #e5e7eb", textAlign: "center" },
  categoryName: { fontWeight: 700, color: "#0f172a", marginBottom: 4 },
  categoryValue: { fontSize: 20, fontWeight: 800, color: "#1a5f5f" },
  categorySubtext: { fontSize: 12, color: "#9ca3af", marginTop: 4 },
  filterBar: { display: "flex", gap: 12, marginBottom: 20 },
  select: { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, fontFamily: "inherit" },
  input: { flex: 1, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, fontFamily: "inherit" },
  itemsGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 },
  itemCard: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, transition: "all 0.2s" },
  itemHead: { display: "flex", justifyContent: "space-between", marginBottom: 8 },
  itemSku: { fontSize: 11, fontFamily: "monospace", color: "#2563eb", fontWeight: 700 },
  itemMargin: { fontSize: 11, background: "#d1fae5", color: "#059669", padding: "2px 6px", borderRadius: 3, fontWeight: 700 },
  itemName: { fontWeight: 600, fontSize: 13, color: "#0f172a", marginBottom: 6 },
  itemMeta: { fontSize: 11, color: "#6b7280", marginBottom: 8 },
  itemPrice: { fontSize: 18, fontWeight: 800, color: "#1a5f5f", marginBottom: 8 },
  itemTags: { display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" },
  tag: { fontSize: 10, background: "#f3f4f6", color: "#374151", padding: "2px 6px", borderRadius: 3 },
  itemFooter: { display: "flex", gap: 6, alignItems: "center" },
  qtyInput: { width: 50, padding: "4px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 },
  addBtn: { flex: 1, background: "#1a5f5f", color: "#fff", border: "none", padding: "6px", borderRadius: 4, fontWeight: 700, cursor: "pointer", fontSize: 14 },
  dupeGroup: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 16, marginBottom: 16 },
  dupeHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  dupeCount: { background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20 },
  dupeItems: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 },
  dupeItem: { background: "#fff", border: "1px solid #fecaca", borderRadius: 6, padding: 12 },
  dupeItemHead: { display: "flex", justifyContent: "space-between", marginBottom: 6 },
  dupePrice: { fontSize: 16, fontWeight: 800, color: "#0f172a" },
  dupeItemSub: { display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "#6b7280" },
  cartItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f3f4f6" },
  deleteBtn: { background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: 0 },
  exportBtn: { background: "#1a5f5f", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit" },
  budgetDetailCard: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 16 },
  budgetCardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  aiContainer: { display: "flex", flexDirection: "column", height: "100%", background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden" },
  aiChat: { flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  aiEmpty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, color: "#6b7280", textAlign: "center" },
  aiMsg: { maxWidth: "80%", padding: "12px 16px", borderRadius: 8, fontSize: 14, lineHeight: 1.5 },
  aiMsgUser: { background: "#1a5f5f", color: "#fff", marginLeft: "auto" },
  aiMsgAssistant: { background: "#f3f4f6", color: "#0f172a" },
  aiInput: { display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e5e7eb" },
  aiInputField: { flex: 1, padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, fontFamily: "inherit" },
  aiSendBtn: { background: "#1a5f5f", color: "#fff", border: "none", width: 40, borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 16 },
  empty: { textAlign: "center", color: "#9ca3af", padding: "40px 20px" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#fff", borderRadius: 8, padding: 24, maxWidth: 500, width: "90%" },
  modalTitle: { fontSize: 20, fontWeight: 700, margin: "0 0 12px 0", color: "#0f172a" },
  modalHint: { fontSize: 12, color: "#6b7280", margin: "0 0 16px 0" },
  fileInput: { display: "block", marginBottom: 12, padding: "8px", border: "1px solid #d1d5db", borderRadius: 6, width: "100%" },
  cancelBtn: { background: "#e5e7eb", color: "#0f172a", border: "none", padding: "10px 20px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  toast: { position: "fixed", bottom: 24, right: 24, background: "#1a5f5f", color: "#fff", padding: "12px 20px", borderRadius: 6, fontWeight: 600, zIndex: 999 },
};
