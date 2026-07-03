export type Lang = "uk" | "en";

const t = {
  uk: {
    // ── Sidebar ──────────────────────────────────────────────
    nav_dashboard: "Дашборд",
    nav_agents: "Агенти",
    nav_calendar: "Календар",
    nav_analyst: "Агент Аналітик",
    nav_assortment: "Асортимент",
    nav_invoices: "Рахунки",
    nav_settings: "Налаштування",
    nav_logout: "Вийти",

    // ── Auth ─────────────────────────────────────────────────
    auth_subtitle_login: "Увійдіть у свій кабінет",
    auth_email: "Електронна пошта",
    auth_password: "Пароль",
    auth_signing_in: "Входимо…",
    auth_sign_in: "Увійти",
    auth_no_account: "Ще немає акаунту?",
    auth_create_workspace: "Створити кабінет",
    auth_subtitle_register: "Створіть свій кабінет",
    auth_business_name: "Назва бізнесу",
    auth_your_name: "Ваше ім'я",
    auth_confirm_password: "Підтвердіть пароль",
    auth_creating: "Створюємо…",
    auth_create_btn: "Створити кабінет",
    auth_have_account: "Вже є акаунт?",
    auth_err_passwords: "Паролі не збігаються",
    auth_err_short: "Пароль має бути не менше 8 символів",
    auth_err_network: "Помилка мережі. Спробуйте ще раз.",

    // ── Dashboard ────────────────────────────────────────────
    dash_overview: "Огляд",
    dash_title: "Дашборд",
    dash_skus: "Товарів у базі",
    dash_alerts: "Активних алертів",
    dash_model: "Бізнес-модель",
    dash_sync: "Останній синк",
    dash_in_catalog: "у каталозі",
    dash_agent_off: "агент не налаштований",
    dash_configured: "налаштовано",
    dash_not_set: "не вказано",
    dash_no_source: "немає джерела",
    dash_s1_label: "Крок 1 — Обов'язково",
    dash_s1_title: "Заповніть бриф онбордингу",
    dash_s1_desc: "Вкажіть модель бізнесу щоб активувати Агента Аналітика",
    dash_s1_btn: "Почати →",
    dash_s2_label: "Крок 2 — Дані",
    dash_s2_title: "Підключіть каталог товарів",
    dash_s2_desc: "Завантажте асортиментну матрицю або підключіть Google Drive",
    dash_s2_btn: "Підключити →",
    dash_ready_label: "Готово",
    dash_ready_title: "Агент Аналітик готовий до роботи",
    dash_ready_btn: "Відкрити агента →",
    dash_ready_loaded: "товарів завантажено",
    dash_ready_model: "модель",
    dash_ready_active: "активна",

    // ── Dashboard alerts ─────────────────────────────────────
    dash_no_alerts: "Алертів немає",
    dash_alerts_sub: "потребують уваги",
    dash_critical_label: "КРИТИЧНО — СТОКАУТ",
    dash_opportunity_label: "МОЖЛИВІСТЬ — ХІТ",
    dash_days_left: "дн. залишку",
    dash_sold_7d: "прод. 7д",
    dash_avg_daily: "ср/день",
    dash_view_analyst: "Відкрити →",
    dash_all_stockouts: "Всі стокаути →",
    dash_all_hits: "Всі хіти →",
    dash_top_stockouts: "Критичні стокаути",
    dash_top_hits: "Топ хіти тижня",

    // ── Planner nav ──────────────────────────────────────────
    p_overview: "Огляд",
    p_catalog: "Каталог",
    p_duplicates: "Дублі",
    p_order: "Замовлення",
    p_ai: "AI",
    p_brands: "Бренди",
    p_upload_btn: "Завантажити",
    p_scan_btn: "Сканувати",
    p_scanning: "Скануємо…",
    p_export_btn: "Експорт ЗП",
    p_add_brand_btn: "Додати бренд",

    // ── Planner overview ─────────────────────────────────────
    p_brands_count: "Брендів",
    p_items_count: "Товарів у каталозі",
    p_in_order: "У замовленні",
    p_budget_used: "Бюджет використано",
    p_catalogs: "каталогів",
    p_across: "по всіх брендах",
    p_units: "одиниць",
    p_of: "з",
    p_budget_by_brand: "Бюджет по брендах",
    p_no_brands_budget: "Брендів ще немає. Додайте бренди для відстеження бюджету.",
    p_recent_uploads: "Останні завантаження",
    p_items: "позицій",

    // ── Catalog ──────────────────────────────────────────────
    p_all_brands: "Всі бренди",
    p_all_cats: "Всі категорії",
    p_search_ph: "Пошук назви / артикулу…",
    p_search_btn: "Шукати",
    p_empty_no_brands: "Спочатку додайте бренд, потім завантажте каталог.",
    p_empty_no_items: "Товарів не знайдено. Завантажте каталог або змініть фільтри.",
    p_add: "+ Додати",
    p_avail: "доступно",

    // ── Duplicates ───────────────────────────────────────────
    p_dupes_no_scan_title: "Сканування ще не виконано",
    p_dupes_no_scan_desc: "Натисніть «Сканувати» щоб знайти схожі позиції між брендами",
    p_dupes_found: "Знайдено",
    p_dupes_groups: "груп схожих позицій між різними брендами",
    p_dupes_brands: "бренди",
    p_add_to_order: "До замовлення",

    // ── Cart ─────────────────────────────────────────────────
    p_cart_empty_title: "Замовлення порожнє",
    p_cart_empty_desc: "Перейдіть до Каталогу та додайте товари",
    p_cart_left: "залишилось",
    p_cart_over: "перевищено",
    p_cart_total: "Загальна сума замовлення",

    // ── AI ───────────────────────────────────────────────────
    p_ai_title: "Запитайте мене про асортимент",
    p_ai_h1: "• Які товари пріоритетні для закупки?",
    p_ai_h2: "• Де є ризики перевищення бюджету?",
    p_ai_h3: "• Є дублі між брендами?",
    p_ai_h4: "• Як розподілити бюджет оптимально?",
    p_ai_ph: "Запитайте про асортимент, бюджет, дублі…",

    // ── Brands view ──────────────────────────────────────────
    p_brands_empty: "Брендів ще немає. Натисніть «Додати бренд» щоб почати.",
    p_catalogs_count: "каталогів",

    // ── Upload modal ─────────────────────────────────────────
    p_upload_title: "Завантажити каталог",
    p_upload_cols: "Колонки: SKU, Name, Category, Color, Style, Material, Price, Retail, MinOrder, Stock, LeadTime, Tags",
    p_upload_brand: "Бренд",
    p_upload_season: "Сезон",
    p_upload_drop: "Клікніть або перетягніть .xlsx / .csv",
    p_uploading: "Завантажуємо…",

    // ── Brand modal ──────────────────────────────────────────
    p_brand_edit: "Редагувати бренд",
    p_brand_add: "Додати бренд",
    p_brand_name: "Назва бренду",
    p_brand_budget: "Бюджет сезону",
    p_brand_currency: "Валюта",
    p_brand_payment: "Відстрочка (днів)",
    p_brand_lead: "Лід-тайм (днів)",
    p_brand_country: "Країна",
    p_brand_contact: "Контактний email",
    p_brand_save: "Зберегти",
    p_brand_saving: "Зберігаємо…",

    // ── Toasts ───────────────────────────────────────────────
    toast_added: "додано до замовлення",
    toast_brand_saved: "Бренд збережено",
    toast_brand_deleted: "Бренд видалено",
  },

  en: {
    // ── Sidebar ──────────────────────────────────────────────
    nav_dashboard: "Dashboard",
    nav_agents: "Agents",
    nav_calendar: "Calendar",
    nav_analyst: "Analyst Agent",
    nav_assortment: "Assortment",
    nav_invoices: "Invoices",
    nav_settings: "Settings",
    nav_logout: "Log out",

    // ── Auth ─────────────────────────────────────────────────
    auth_subtitle_login: "Sign in to your workspace",
    auth_email: "Email",
    auth_password: "Password",
    auth_signing_in: "Signing in…",
    auth_sign_in: "Sign in",
    auth_no_account: "No account yet?",
    auth_create_workspace: "Create workspace",
    auth_subtitle_register: "Create your workspace",
    auth_business_name: "Business Name",
    auth_your_name: "Your Name",
    auth_confirm_password: "Confirm Password",
    auth_creating: "Creating…",
    auth_create_btn: "Create workspace",
    auth_have_account: "Already have an account?",
    auth_err_passwords: "Passwords do not match",
    auth_err_short: "Password must be at least 8 characters",
    auth_err_network: "Network error. Please try again.",

    // ── Dashboard ────────────────────────────────────────────
    dash_overview: "Overview",
    dash_title: "Dashboard",
    dash_skus: "Total SKUs",
    dash_alerts: "Active Alerts",
    dash_model: "Business Model",
    dash_sync: "Last Sync",
    dash_in_catalog: "in catalog",
    dash_agent_off: "analyst not set up",
    dash_configured: "configured",
    dash_not_set: "not set",
    dash_no_source: "no source",
    dash_s1_label: "Step 1 — Required",
    dash_s1_title: "Complete onboarding brief",
    dash_s1_desc: "Tell us about your business model to activate the Analyst Agent",
    dash_s1_btn: "Start →",
    dash_s2_label: "Step 2 — Data",
    dash_s2_title: "Connect your product catalog",
    dash_s2_desc: "Upload your assortment matrix or connect Google Drive",
    dash_s2_btn: "Connect →",
    dash_ready_label: "Ready",
    dash_ready_title: "Analyst Agent is ready",
    dash_ready_btn: "Open Analyst →",
    dash_ready_loaded: "SKUs loaded",
    dash_ready_model: "model",
    dash_ready_active: "active",

    // ── Dashboard alerts ─────────────────────────────────────
    dash_no_alerts: "No alerts",
    dash_alerts_sub: "need attention",
    dash_critical_label: "CRITICAL — STOCKOUT",
    dash_opportunity_label: "OPPORTUNITY — HIT",
    dash_days_left: "d. left",
    dash_sold_7d: "sold 7d",
    dash_avg_daily: "avg/day",
    dash_view_analyst: "Open →",
    dash_all_stockouts: "All stockouts →",
    dash_all_hits: "All hits →",
    dash_top_stockouts: "Critical stockouts",
    dash_top_hits: "Top hits this week",

    // ── Planner nav ──────────────────────────────────────────
    p_overview: "Overview",
    p_catalog: "Catalog",
    p_duplicates: "Duplicates",
    p_order: "Order",
    p_ai: "AI",
    p_brands: "Brands",
    p_upload_btn: "Upload",
    p_scan_btn: "Scan",
    p_scanning: "Scanning…",
    p_export_btn: "Export PO",
    p_add_brand_btn: "Add brand",

    // ── Planner overview ─────────────────────────────────────
    p_brands_count: "Brands",
    p_items_count: "Catalog items",
    p_in_order: "In order",
    p_budget_used: "Budget used",
    p_catalogs: "catalogs",
    p_across: "across all brands",
    p_units: "units",
    p_of: "of",
    p_budget_by_brand: "Budget by brand",
    p_no_brands_budget: "No brands yet. Add brands to track budgets.",
    p_recent_uploads: "Recent uploads",
    p_items: "items",

    // ── Catalog ──────────────────────────────────────────────
    p_all_brands: "All brands",
    p_all_cats: "All categories",
    p_search_ph: "Search name / SKU…",
    p_search_btn: "Search",
    p_empty_no_brands: "Add a brand first, then upload a catalog.",
    p_empty_no_items: "No items. Upload a catalog or adjust filters.",
    p_add: "+ Add",
    p_avail: "avail",

    // ── Duplicates ───────────────────────────────────────────
    p_dupes_no_scan_title: "No duplicates scanned yet",
    p_dupes_no_scan_desc: 'Click "Scan" to find similar items across brands',
    p_dupes_found: "Found",
    p_dupes_groups: "groups of similar items across brands",
    p_dupes_brands: "brands",
    p_add_to_order: "Add to order",

    // ── Cart ─────────────────────────────────────────────────
    p_cart_empty_title: "Order is empty",
    p_cart_empty_desc: "Go to Catalog and add items",
    p_cart_left: "left",
    p_cart_over: "over",
    p_cart_total: "Total order value",

    // ── AI ───────────────────────────────────────────────────
    p_ai_title: "Ask me about your assortment",
    p_ai_h1: "• Which items should I prioritize?",
    p_ai_h2: "• Where are the budget risks?",
    p_ai_h3: "• Are there duplicate items across brands?",
    p_ai_h4: "• How should I distribute the budget?",
    p_ai_ph: "Ask about assortment, budget, duplicates…",

    // ── Brands view ──────────────────────────────────────────
    p_brands_empty: 'No brands yet. Click "Add brand" to get started.',
    p_catalogs_count: "catalogs",

    // ── Upload modal ─────────────────────────────────────────
    p_upload_title: "Upload catalog",
    p_upload_cols: "Columns: SKU, Name, Category, Color, Style, Material, Price, Retail, MinOrder, Stock, LeadTime, Tags",
    p_upload_brand: "Brand",
    p_upload_season: "Season",
    p_upload_drop: "Click or drop .xlsx / .csv",
    p_uploading: "Uploading…",

    // ── Brand modal ──────────────────────────────────────────
    p_brand_edit: "Edit brand",
    p_brand_add: "Add brand",
    p_brand_name: "Brand name",
    p_brand_budget: "Season budget",
    p_brand_currency: "Currency",
    p_brand_payment: "Payment days",
    p_brand_lead: "Lead time (days)",
    p_brand_country: "Country",
    p_brand_contact: "Contact email",
    p_brand_save: "Save",
    p_brand_saving: "Saving…",

    // ── Toasts ───────────────────────────────────────────────
    toast_added: "added to order",
    toast_brand_saved: "Brand saved",
    toast_brand_deleted: "Brand deleted",
  },
} as const;

export type TKey = keyof typeof t.uk;
export type Translations = Record<TKey, string>;

export function getT(lang: Lang): Translations {
  return (t[lang] ?? t.uk) as Translations;
}

export default t;
