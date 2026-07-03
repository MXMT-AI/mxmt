# MXMT Analytics

**AI-powered marketing & inventory analytics platform for fashion retail.**

B2B SaaS інструмент для fashion-бізнесів: аналіз асортименту, планування закупок, маркетинговий календар і система AI-агентів. Розроблявся з нуля, задеплоєний на Railway.

---

## Зміст

1. [Що це за продукт](#що-це-за-продукт)
2. [Архітектура та стек](#архітектура-та-стек)
3. [Актуальний стан — що зроблено](#актуальний-стан--що-зроблено)
4. [Система 9 агентів — архітектура](#система-9-агентів--архітектура)
5. [Що реально працює зараз](#що-реально-працює-зараз)
6. [Відомі баги та обмеження](#відомі-баги-та-обмеження)
7. [Структура файлів](#структура-файлів)
8. [База даних — Prisma Schema](#база-даних--prisma-schema)
9. [Змінні середовища Railway](#змінні-середовища-railway)
10. [Запуск локально](#запуск-локально)
11. [Деплой на Railway](#деплой-на-railway)
12. [Важливі нюанси](#важливі-нюанси)
13. [Roadmap — що далі](#roadmap--що-далі)

---

## Що це за продукт

MXMT Analytics — маркетинговий інструмент для fashion-рітейлу.

- **Не тільки інвентар** — охоплює маркетинг, закупки, аналітику в єдиному циклі
- **UA-специфіка** — сезонні коефіцієнти під UA-ринок, UAH/EUR ризики, UA-календар подій
- **Мультитенантність** — один продукт, багато бізнесів, повна ізоляція даних
- **9 AI-агентів** — аналізують склад, канали, категорії, генерують рекомендації, трекають кампанії
- **Двомовний** — Ukrainian / English з перемикачем
- **Темна і світла теми** — перемикач у сайдбарі

### Основні модулі

| Модуль | URL | Статус |
|---|---|---|
| Дашборд | `/dashboard` | ✅ Реальні алерти + sparkline продажів |
| Агенти | `/agents` | ✅ Повний pipeline 9 агентів + період даних «від–до» + трасування + розрахунок акції з експортом у Google Sheets |
| Маркетинговий Календар | `/calendar` | ✅ Динамічні тижні, UA свята, AI план |
| Агент Аналітик | `/analyst` | ✅ SKU-класифікація + пагінація + AI chat |
| Планер Асортименту | `/assortment` | ✅ Каталог (Drive-sync) + кошик + AI |
| Налаштування | `/settings` | ✅ Онбординг + Drive + AI провайдер per-agent |
| Рахунки / Інвойси | `/invoices` | 🚧 Placeholder |

---

## Архітектура та стек

### Технології

```
Next.js 15 (App Router)     — frontend + backend в одному сервісі
TypeScript                  — строга типізація скрізь
PostgreSQL                  — основна БД (Railway add-on)
Prisma ORM                  — схема, типобезпечні запити, db push
JWT (jose)                  — access 15хв + refresh 30д, httpOnly cookies
bcryptjs                    — хешування паролів і refresh токенів
Tailwind CSS                — стилізація, CSS custom properties для тем
Anthropic SDK               — Claude Sonnet 4.6 / Haiku 4.5 (default)
OpenAI SDK                  — GPT-4o / GPT-4o mini (альтернатива)
SheetJS (xlsx)              — парсинг Excel на сервері і клієнті
Node.js crypto              — RS256 JWT для Google Service Account
```

### Принципи

- **Один сервіс** на Railway — Next.js обробляє і frontend і API
- **Multi-tenant** — кожен бізнес ізольований через `tenantId` на всіх таблицях
- **API ключі тільки на сервері** — AI виклики проксуються через `/api/agents/*`
- **AI не рахує математику** — всі метрики (WOH, STR, Trend, GM) рахуються в PostgreSQL, AI тільки інтерпретує

### AI Abstraction Layer

`lib/ai.ts` — `chat()` функція:
```
AI_PROVIDER env var           → anthropic (default) або openai
providerOverride arg          → per-agent override (з localStorage налаштувань)
```
Пріоритет: providerOverride > env var. Клієнт ніколи не бачить API ключів.

---

## Актуальний стан — що зроблено

### Сесія 1 — Фундамент та основні модулі

**Auth система:**
- JWT + httpOnly cookies + refresh rotation + silent refresh
- `middleware.ts` — Edge JWT guard, expired → redirect на silent-refresh
- `TokenRefreshProvider.tsx` — клієнтський таймер, refresh за 2хв до exp
- `apiFetch()` — wrapper з авто-retry після 401

**Dashboard (`/dashboard`):**
- 4 KPI-картки: Товарів, Алертів, Бізнес-модель, Синк
- Блок топ-4 стокаутів (сортованих за терміновістю)
- Блок топ-4 хітів тижня
- Sparkline продажів за 30 днів
- Week-over-week порівняння

**Планер Асортименту (`/assortment`):**
- Управління брендами (бюджет, валюта, lead time)
- Upload Excel-каталогів → auto-upsert в `Sku` таблицю
- Кошик з бюджет-трекером, auto-save в PostgreSQL
- Детекція дублів між брендами
- AI асистент + Експорт PO в Excel

**Маркетинговий Календар (`/calendar`):**
- **Динамічні тижні** — `generateWeeks(13)` від поточної дати, ISO week numbers
- **Ремапінг демо-даних** — DEMO_DATA зміщується з w14-w26 на поточні тижні
- **UA свята** — автоматично заповнюються в рядку "events"
- **AI Plan** — кнопка ✨, `POST /api/calendar/ai-plan` → Claude генерує план
- **Редагування подій** — PATCH `/api/calendar/events/[id]`
- **Expand/Collapse** — блоки Інсайти агента і Статус залишків: 10 елементів + розгортання
- DEMO шаблон ZAVOD прихований за замовчуванням, кнопка "Шаблон" для показу

**Агент Аналітик (`/analyst`):**
- Класифікація 5 флагів: 🔥 Хіт / 🛑 Стокаут / 📉 Слоу / 💤 Зависший / ✅ Норма
- **Пагінація**: 20/50/100 на сторінці, dropdown вибір, скидання при фільтрі
- **AI chat переміщений ВИЩЕ таблиці** з товарами
- Реальні помилки в чаті: `❌ Error: ...` замість мовчазного fail

**Налаштування (`/settings`):**
- Онбординг бриф: SEASONAL/CARRYOVER/HYBRID
- Google Drive sync (SA mode + public link mode)
- **Вкладки**: Загальне / Агенти
- **AI провайдер глобально** в табі Загальне
- **Per-agent провайдер** в табі Агенти — для кожного з 9 агентів окремо

**Теми:**
- CSS custom properties: `var(--bg)`, `var(--surface)`, `var(--text)`, `var(--muted)` тощо
- Клас `html.light` перемикає всі змінні
- **Inline script в `<head>`** — запобігає flash при SSR: читає localStorage до гідратації
- `ThemeToggle` — кнопка з текстом "Light"/"Dark" + іконка у сайдбарі

**Google Drive sync — повна переробка (`lib/gdrive.ts`):**
- `extractFileId()` — підтримує повні URL і bare ID
- `parseWithAutoHeader()` — сканує перші 10 рядків на наявність "Article"/"SKU"
- `findOrCreateBrand()` — з Map-кешем для дедуплікації
- `importArticleReport()`:
  - SKU upsert
  - Brand linkage
  - "Stock units" → `InventorySnapshot`
  - Місячні колонки 1-12 → `SalesRecord` (по одному запису на місяць)
  - "Sales Last week" → `SalesRecord`
  - **CatalogItem sync** — паралельно записує в `CatalogUpload` + `CatalogItem` для Планера
- `importZavodApi()`:
  - `product.sku` + `orderTime` → `SalesRecord` з `channel: "online"`
  - Дублі в один день — update замість create
- `downloadPublicFile()` — пробує Sheets export URL, fallback на Drive UC URL

**Railway фікси:**
- Прибрано `output: standalone` з `next.config.ts` — спричиняло 502
- `startCommand = "npx prisma db push && npm run start"` в `railway.toml`

---

### Сесія 2 — Система 9 агентів (Блоки 1-3)

**Новий модуль `/agents` (pipeline сторінка):**
- Візуальний пайплайн з 4 блоками та стрілками між ними
- 9 карточок агентів: модель, провайдер, статус, час останнього запуску, тривалість
- Polling кожні 3с поки агент `running`
- Кнопка "Запустити" на всіх 9 агентах
- Баджики результатів per-agent (CRITICAL / WARNING / Coverage% / кількість кампаній тощо)
- Розгортний вивід результатів per-agent з детальним inline-переглядом
- Модальне вікно "Переглянути аналіз" (AnalysisModal) — повний структурований вивід

**Нова DB модель `AgentRun`:**
```prisma
model AgentRun {
  id         String    @id @default(cuid())
  tenantId   String
  agentType  String    // "inventory_analyst" | "channel_analytics" | ...
  entityId   String    @default("all")
  status     String    // "running" | "done" | "error"
  input      Json      @default("{}")  // { provider, asOf? }
  output     Json?     // результат агента + _debug
  errorMsg   String?
  startedAt  DateTime  @default(now())
  finishedAt DateTime?
}
```

**`lib/brand-metrics.ts` — SQL-метрики по брендах (підтримує `asOf?`):**
- Запитує всі бренди → SKU (ACTIVE/NEW) → останній inventory snapshot → продажі 30д
- Рахує: WOH, STR%, Trend (7d vs 7-14d), GM%, frozenCapital
- `asOf?: Date` — зсуває всі вікна (d7/d14/d30) відносно переданої дати; фільтрує `snapshotDate: { lte: asOf }`
- Включає SKU без бренда як окремий bucket "Без бренда"

**`lib/channel-metrics.ts` — метрики по каналах (підтримує `asOf?`):**
- `groupBy channel` з `SalesRecord` за 7d і 30d
- При `asOf` фільтрує `date: { lte: asOf }` і `snapshotDate: { lte: asOf }`

**`lib/attribute-metrics.ts` — метрики по категоріях (підтримує `asOf?`):**
- Групує ACTIVE/NEW SKU по `category` і `subcategory`
- Рахує STR, статус: bestseller/normal/slow/dead
- При `asOf` фільтрує продажі та inventory snapshots

**Агент 1: Inventory Analyst** (`/api/agents/inventory-analyst`):
- `POST` — запускає агента, передає провайдер і `asOf` з body
- `GET` — повертає останній запуск для кожного з 9 агентів
- Повертає JSON: `status`, `analysis`, `metrics_evaluation`, `suggested_actions`, `urgency`

**Агент 2: Channel Analytics** (`/api/agents/channel-analytics`):
- Аналізує канали: online vs offline
- Claude визначає статус: best/normal/weak/inactive + рекомендацію

**Агент 3: Product Attributes** (`/api/agents/product-attributes`):
- Аналізує категорії по STR
- Claude виділяє bestsellers і dead stock

**Агент 4: Repricing Strategy** (`/api/agents/repricing`):
- Кандидати: бренди з WOH > 45 або trend < -15%
- Claude генерує 3 варіанти: AGGRESSIVE / BALANCED / CONSERVATIVE
- Кожен варіант: `discount_percent`, `duration_days`, `forecast`, `evaluation` (pros/cons/risks/score/recommended)

**Агент 5: Reordering Strategy** (`/api/agents/reordering`):
- Кандидати: бренди з WOH < 30 (ризик стокауту)
- Claude генерує 3 сценарії: PESSIMISTIC / REALISTIC / OPTIMISTIC
- Кожен сценарій: `qty_multiplier`, `woh_after`, `risk_level`, `evaluation`

**Агент 6: Commercial Marketer** (`/api/agents/commercial-marketer`):
- Читає рекомендовані дії з останніх запусків Repricing + Reordering
- Якщо немає — fallback на бренди з WOH > 45
- Claude генерує брифи по 5 каналах: SMM, Email, Ads, Store, Marketplace
- Кожен бриф: `brief`, `frequency`/`send_timing`/`budget_recommendation`, `start_date`, `priority`
- Заборонено використовувати терміни WOH/STR/GM — тільки людська мова

**Агент 7: Calendar Agent** (`/api/agents/calendar-agent`):
- Читає `MarketingEvent` за поточні + 3 наступні тижні
- Читає брифи з останнього Commercial Marketer
- Claude знаходить: `gap` (не заплановане) / `conflict` (два в один день) / `timing` (не вчасно) / `ok`
- Вихід: `annotations[]` + `health_score` (coverage_percent, critical_gaps)

**Per-agent провайдер:**
- `components/settings/AgentProvidersCard.tsx` — 9 агентів з Anthropic/OpenAI toggle
- `localStorage` під ключем `mxmt_agent_providers`
- При зміні диспатчить `mxmt_providers_changed` event
- `getAgentProvider(agentId)` повертає провайдер для конкретного агента

---

### Сесія 3 — Агенти Блоку 4 + Прозорість + Drive→Каталог фікс

#### Фікс: Drive sync → CatalogItem

**Проблема:** Drive sync записував тільки в `Sku` (для аналітики), а Планер Асортименту читає з `CatalogItem` — таблиці порожні.

**Рішення** в `lib/gdrive.ts`, функція `importArticleReport()`:
- Під час обробки рядків збирається `catalogBatch: Map<brandId, items[]>`
- Після завершення основного loop — для кожного бренда:
  - `findFirst` або `create` `CatalogUpload` з сезоном `"SS26 (Drive)"` (автодетекція: березень-серпень = SS, решта = AW)
  - `deleteMany` старих `CatalogItem` для цього каталогу
  - `createMany` нових з полями: `sku`, `name`, `category`, `priceWholesale` (= pricePurchase), `priceRetail`
  - `update` `CatalogUpload.itemCount`
- Результат синку тепер включає `каталог: N`

---

#### Агент 8: Campaign Analysis (`/api/agents/campaign-analysis`)

Відстежує активні кампанії (з Commercial Marketer) відносно поточних метрик продажів.

**Логіка:**
1. Читає останній `commercial_marketer` run → витягує список брендів з брифами
2. Отримує `getBrandMetrics(tenantId, asOf?)` — поточний тренд і темп продажів
3. Обчислює `daysRunning` для кожної кампанії за `start_date` з каналів
4. Claude оцінює статус кожної кампанії:
   - `on_track` — тренд стабільний або кампанія < 3 днів
   - `ahead` — тренд > +15%
   - `behind` — тренд не покращився після 3+ днів
   - `stalled` — немає даних

**Вихід:** `campaigns[]` + `overall_health` (on_track/needs_attention/critical) + `summary`

---

#### Агент 9: Weekly Report (`/api/agents/weekly-report`)

Мета-агент — синтезує результати всіх 8 попередніх агентів в єдиний звіт для двох аудиторій.

**Логіка:**
1. `isoWeekNumber()` — обчислює ISO номер тижня
2. Паралельно читає останні `done` runs для всіх 8 агентів
3. Будує текстовий summary кожного агента (скорочена статистика без JSON)
4. Claude генерує:
   - `pm_brief` — 3-4 речення для PM: факти, що вирішено, що потребує рішення
   - `marketing_brief` — 3-4 речення для маркетингу: що робити, який тон, які бренди
   - `top_priorities[]` — максимум 5 найтерміновіших дій (rank, type, brand, action, deadline)
   - `decisions_needed[]` — тільки те, що вирішує PM (бюджет, знижки, дозамовлення)
   - `wins[]` — позитивне, навіть якщо ситуація важка
   - `next_week_focus` — одне речення на що зосередитись
   - `inventory_health` — зведена статистика (critical/warning/ok/total brands)

---

#### Прозорість агентів — `_debug` поле

**Кожен з 9 агентів** тепер зберігає в `output._debug`:

```typescript
{
  systemPrompt: string,       // повний системний промт (роль + правила + JSON схема)
  userPrompt: string,         // точні дані, відправлені в AI (метрики, цифри)
  rawResponse: string,        // сирий ответ AI до парсингу JSON
  provider: "anthropic" | "openai",
  model: "claude-sonnet-4-6" | "gpt-4o",
  parsedSuccessfully: boolean, // чи вдалось розпарсити JSON
  // агент-специфічні поля:
  brandCount?: number,
  candidateCount?: number,
  channelCount?: number,
  categoryCount?: number,
  decisionCount?: number,
  campaignCount?: number,
  calendarEventCount?: number,
  weeksAnalyzed?: string[],
  agentsIncluded?: number,     // для Weekly Report
  asOf?: string | null,        // дата аналізу (якщо не сьогодні)
  analyzedAt: string,          // ISO timestamp запуску
}
```

**UI — кнопка "Трассировка"** (іконка `Code2`) поруч з "Переглянути аналіз":
- З'являється тільки коли є `output._debug`
- Відкриває `DebugModal` — повне вікно з:
  - **Метадані запуску**: провайдер, модель, парсинг, тривалість, кількість брендів/кандидатів тощо
  - **Дата аналізу** (жовтим кольором, якщо не сьогодні)
  - **Системний промт** — колапсований розділ з char count + copy
  - **Дані для аналізу** — розгорнутий за замовчуванням (те що реально відправили в AI)
  - **Сирий ответ AI** — колапсований, до парсингу JSON
  - Попередження якщо `parsedSuccessfully: false` (використано fallback)

---

#### Вибір дати аналізу (`asOf`)

**Де:** панель зверху сторінки `/agents`, між заголовком і pipeline-діаграмою.

**Як працює:**
- `<input type="date">` обмежений `max={today}`
- За замовчуванням — сьогодні
- При виборі минулої дати — передає `asOf: "YYYY-MM-DD"` в POST body кожного агента
- Кнопка "Сегодня" для скидання

**Що зсувається при `asOf`:**
- `d7 = asOf - 7d`, `d14 = asOf - 14d`, `d30 = asOf - 30d`
- `salesRecords.date: { lte: asOf }` + `inventorySnapshots.snapshotDate: { lte: asOf }`
- Prompts агентів: `"Дата анализа: YYYY-MM-DD"` замість `"Сегодня: ..."`

**Застереження (відображаються в UI при виборі минулої дати):**

| Блок | Застереження |
|---|---|
| Блоки 1–2 | Метрики продажів точні. Залишки — ближній snapshot до дати (якщо немає щоденних знімків — поточні) |
| Блок 3 (Execution) | Commercial Marketer і Calendar Agent генерують рекомендації на майбутнє — для минулої дати вони будуть ретроспективними |
| Блок 4 (Tracking) | Campaign Analysis і Weekly Report читають збережені результати інших агентів — дата майже не впливає на їх вивід |

`asOf` зберігається в `AgentRun.input` і відображається в DebugModal.

---

### Сесія 4 — Період даних «від–до» + Розрахунок акції з експортом

#### Період даних `dateFrom` (доповнення до `asOf`)

**Де:** панель «Період даних» зверху `/agents` — два дата-пікери «від» і «до».

**Семантика:** поле «від» необовʼязкове. Якщо порожнє — стандартне вікно 30 днів. Якщо заповнене — аналізується тільки період `[dateFrom, asOf]`:
- Швидкість продажів = продажі за період ÷ днів у періоді (замість ÷30)
- WOH = залишок ÷ швидкість за період
- **Тренд = друга половина періоду vs перша половина** (замість 7д vs 7–14д)
- STR = продажі за останні 7 днів періоду ÷ залишок (обрізається до початку періоду)

**Реалізація:** `getBrandMetrics(tenantId, asOf?, from?)`, `getChannelMetrics(...)`, `getAttributeMetrics(...)` — третій параметр `from`. Всі 9 роутів парсять `body.dateFrom`, зберігають у `AgentRun.input` і `_debug.dateFrom`, додають рядок «Период данных: …» у промт. Залишки завжди беруться на дату «до» — `dateFrom` на них не впливає.

#### Розрахунок акції — «Переглянути в таблиці» (Repricing)

Кнопка зʼявляється під кожним варіантом уцінки (AGGRESSIVE/BALANCED/CONSERVATIVE) з `discount_percent > 0` — і в модалці «Переглянути аналіз», і в розгорнутому вигляді картки.

**Принцип:** AI обирає параметри сценарію (знижка, строк, прогноз % продажу) — вся математика детермінована, без AI:
- `lib/promo-calc.ts` — `simulatePromo()`: бере всі ACTIVE/NEW SKU бренда з залишком > 0, рахує по кожному: ціну зі знижкою, маржу до/після, прогноз продажу (AI `units_to_sell_percent` від залишку, fallback — еластичність ×2 від базової швидкості), виручку, звільнений капітал, залишок і WOH після акції
- `POST /api/agents/repricing/simulate` — `{ brandId, discountPercent, durationDays, unitsToSellPercent?, asOf?, dateFrom? }` → таблиця по SKU + підсумки
- `components/agents/PromoTableModal.tsx` — модалка з summary-картками і таблицею

#### Розрахунок дозамовлення — «Переглянути в таблиці» (Reordering)

Аналогічна кнопка під кожним сценарієм (PESSIMISTIC/REALISTIC/OPTIMISTIC):
- `lib/reorder-calc.ts` — `simulateReorder()`: замовлення = швидкість × 45 дн × `qty_multiplier` − залишок (семантика множника з промпта агента: 1.0 = покрити до 45 днів)
- `POST /api/agents/reordering/simulate` + `components/agents/ReorderTableModal.tsx`
- Інші 7 агентів таблиць не мають свідомо — їх вивід не товарний (канали, категорії, брифи, календар, звіти)

**Експорт (спільний компонент `components/agents/ExportButtons.tsx`):**
- **«Завантажити Excel»** — єдина кнопка експорту. Завантажує .xlsx **з живими формулами**: параметри в шапці (знижка B2 / покриття B2 + множник E2), зміна — і вся таблиця перераховується. Файл можна вручну закинути в Google Drive — відкриється як Google Таблиця з робочими формулами
- Технічний нюанс SheetJS: formula cell обовʼязково потребує `v: 0` (клітинка без значення викидається при записі)
- `lib/promo-sheet.ts` / `lib/reorder-sheet.ts` — builders 2D-масиву (formulas: true/false)
- Кнопки Google Drive прибрані з UI за рішенням користувача (без OAuth прямий запис у особистий Drive неможливий). Серверна інфраструктура збережена на майбутнє, але не використовується: `lib/gsheets.ts` (Drive multipart upload з конвертацією в Google Sheets, без Sheets API) + `POST /api/export/sheets` + env `GOOGLE_DRIVE_EXPORT_FOLDER_ID`

#### Favicon

`app/icon.svg` — Next.js App Router автоматично віддає його як іконку вкладки браузера.

---

## Система 9 агентів — архітектура

### Принципи

1. **AI не рахує математику** — WOH, STR, Trend рахуються в PostgreSQL. AI тільки інтерпретує.
2. **Готові метрики на вхід** — агент отримує `woh_days=119, str_pct=2.1` а не сирі транзакції
3. **JSON на виході, без тексту** — кожен агент повертає строго JSON без преамбули
4. **Масиви замість динамічних ключів** — `[{value: "BLACK", discount: 25}]` а не `{BLACK: 25}`
5. **Haiku для категоризації, Sonnet для аналізу** — заощаджує 65% вартості
6. **`_debug` в кожному output** — повна трасовність: промт, дані, сирий ответ AI

### 9 агентів по блоках

```
┌─────────────────────────────────────────────────────────────────────┐
│  БЛОК 1 · CORE ANALYTICS · автоматично кожен ранок                  │
│                                                                      │
│  1. Inventory Analyst  (Sonnet)  ✅ РЕАЛІЗОВАНО                     │
│     Вхід: WOH, STR, Trend, GM по брендах з PostgreSQL               │
│     Вихід: CRITICAL | WARNING | BALANCED | EXCELLENT + дії           │
│                                                                      │
│  2. Channel Analytics  (Haiku)   ✅ РЕАЛІЗОВАНО                     │
│     Вхід: продажі grouped by channel (online/offline)                │
│     Вихід: best/normal/weak/inactive + рекомендація                  │
│                                                                      │
│  3. Product Attributes (Haiku)   ✅ РЕАЛІЗОВАНО                     │
│     Вхід: STR по категоріях/підкатегоріях                            │
│     Вихід: bestseller/normal/slow/dead + дія                         │
├─────────────────────────────────────────────────────────────────────┤
│  БЛОК 2 · DECISION SUPPORT · за запитом PM                          │
│                                                                      │
│  4. Repricing Strategy  (Sonnet) ✅ РЕАЛІЗОВАНО                     │
│     3 варіанти уцінки (AGGRESSIVE/BALANCED/CONSERVATIVE)             │
│     + оцінка pros/cons/risks/score кожного                           │
│                                                                      │
│  5. Reordering Strategy (Sonnet) ✅ РЕАЛІЗОВАНО                     │
│     3 сценарії дозамовлення (PESSIMISTIC/REALISTIC/OPTIMISTIC)       │
│     + risk_level, safety_margin, woh_after                           │
├─────────────────────────────────────────────────────────────────────┤
│  БЛОК 3 · EXECUTION · після вибору PM                               │
│                                                                      │
│  6. Commercial Marketer (Sonnet) ✅ РЕАЛІЗОВАНО                     │
│     Брифи по 5 каналах (SMM, Email, Ads, Store, Marketplace)         │
│     ЗАБОРОНЕНО: WOH/STR/GM — тільки людська мова                    │
│                                                                      │
│  7. Calendar Agent      (Haiku)  ✅ РЕАЛІЗОВАНО                     │
│     Gaps і конфлікти в маркетинговому плані                          │
│     Вихід: annotations[], health_score { coverage_percent }          │
├─────────────────────────────────────────────────────────────────────┤
│  БЛОК 4 · TRACKING & REPORTS                                        │
│                                                                      │
│  8. Campaign Analysis   (Sonnet) ✅ РЕАЛІЗОВАНО                     │
│     Трекінг кампаній план vs факт                                     │
│     Вихід: on_track | ahead | behind | stalled per brand             │
│                                                                      │
│  9. Weekly Report       (Sonnet) ✅ РЕАЛІЗОВАНО                     │
│     PM Brief + Marketing Brief + top_priorities + wins               │
│     Синтезує результати всіх 8 агентів в єдиний звіт                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Залежності між агентами

```
Блок 1 (незалежні, читають БД напряму):
  Inventory Analyst ──────────────────┐
  Channel Analytics ──────────────────┤
  Product Attributes ─────────────────┤
                                       ▼
Блок 2 (читають output Блоку 1):      ┌── Repricing ──┐
                                       └── Reordering ──┤
                                                         ▼
Блок 3 (читають output Блоку 2):               Commercial Marketer
                                                         │
                                               Calendar Agent (читає Маркетинговий Календар + Маркетера)
                                                         │
                                                         ▼
Блок 4 (мета-агенти):                          Campaign Analysis (читає Маркетера + БД метрики)
                                               Weekly Report (читає всі 8 попередніх runs)
```

### Вартість (оцінка, 5 брендів/місяць)

| Блок | Вартість |
|---|---|
| Щоденні агенти 1+2+3 | ~$2.10/місяць |
| Decision Support 4+5 (3 рішення/міс) | ~$0.60/місяць |
| Execution 6+7 | ~$0.08/місяць |
| Campaign Analysis 8 | ~$1.34/місяць |
| Weekly Report 9 | ~$0.21/місяць |
| **Разом** | **~$4.33/місяць** |

---

## Що реально працює зараз

### ✅ Повністю функціонально

| Функція | Де | Деталі |
|---|---|---|
| Auth + auto-refresh | Всюди | JWT, silent-refresh, TokenRefreshProvider |
| Drive sync | `/settings` → Загальне | ARTICLE REPORT + ZAVOD_API + CatalogItem |
| SKU класифікація | `/analyst` | 5 флагів, пагінація 20/50/100 |
| Inventory Analyst | `/agents` | Brand-level аналіз, CRITICAL/WARNING/BALANCED |
| Channel Analytics | `/agents` | Online vs offline порівняння |
| Product Attributes | `/agents` | STR по категоріях |
| Repricing Strategy | `/agents` | 3 варіанти уцінки з оцінками |
| Reordering Strategy | `/agents` | 3 сценарії дозамовлення з ризиками |
| Commercial Marketer | `/agents` | Брифи по 5 каналах |
| Calendar Agent | `/agents` | Gaps і конфлікти в плані |
| Campaign Analysis | `/agents` | Трекінг кампаній план vs факт |
| Weekly Report | `/agents` | PM + Marketing brief зі зведенням |
| Agent Трассировка | `/agents` | Промт + дані + сирий ответ AI per-agent |
| Період даних «від–до» | `/agents` | Два дата-пікери + застереження + передача в усі 9 агентів |
| Розрахунок акції | `/agents` → Repricing | «Переглянути в таблиці» → SKU-таблиця + Excel з живими формулами |
| Розрахунок дозамовлення | `/agents` → Reordering | «Переглянути в таблиці» → SKU-таблиця дозаказу + Excel з живими формулами |
| Per-agent провайдер | `/settings` → Агенти | Anthropic/OpenAI per-агент |
| Маркетинговий календар | `/calendar` | Динамічні тижні, UA свята, AI план |
| Теми dark/light | Сайдбар | No-flash SSR |
| Каталог у Планері | `/assortment` | Заповнюється автоматично з Drive sync |

### ⚠️ Частково / є обмеження

| Функція | Обмеження |
|---|---|
| `asOf` + inventory | WOH для минулих дат точний тільки якщо є щоденні `InventorySnapshot`. Без них — поточні залишки |
| `asOf` + Блок 3 | Commercial Marketer і Calendar Agent будуть ретроспективними (не actionable) |
| `asOf` + Блок 4 | Campaign Analysis і Weekly Report читають збережені runs, дата майже не впливає |
| Channel Analytics | Канал з 0 продаж за 7 днів зникає зі списку |
| Product Attributes | Немає color/size — тільки category/subcategory |
| Trend | Тільки 7d vs 7-14d — короткий горизонт для сезонного бізнесу |
| WOH для off-season | Якщо продажів 30д = 0, WOH = 9999 |

### 🚧 Не реалізовано

- Cron-задачі для автоматичного запуску агентів о 08:00
- Рахунки/Інвойси (`/invoices`)
- AnalyticsConfig — пороги WOH/STR/GM per tenant (зараз хардкод у кожному route)
- Telegram webhook для CRITICAL брендів

---

## Відомі баги та обмеження

### Не критично

1. **Channel Analytics пропускає "мертві" канали**
   - `channels` будується з `sales7` groupBy — канал без продаж за 7д зникає
   - Фікс: union з `sales30` groupBy, заповнювати `salesLast7d = 0`

2. **Trend занадто короткий** — 7d vs 7-14d. Для сезонного бізнесу краще 7d vs попередній аналогічний тиждень.

3. **STR в Channel Analytics** — знаменник = весь склад, а не склад цього каналу.

4. **WOH = 9999** — для off-season товарів (продажів 0 за 30д при ненульовому стоку).

5. **Inventory snapshot history** — якщо `InventorySnapshot` не зберігається щодня, аналіз за `asOf` у минулому буде використовувати поточні залишки.

---

## Структура файлів

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx               ← читає tenantId, рендерить Sidebar
│   │   ├── dashboard/page.tsx       ← Server Component, KPI + sparkline
│   │   ├── agents/page.tsx          ← Client Component, pipeline + 9 агентів + дата-пікер
│   │   ├── analyst/page.tsx         ← Server Component → AnalystApp client
│   │   ├── assortment/page.tsx
│   │   ├── calendar/page.tsx
│   │   └── settings/page.tsx        ← табована: Загальне / Агенти
│   ├── api/
│   │   ├── auth/                    ← register, login, refresh, logout, silent-refresh
│   │   ├── ai/route.ts              ← загальний AI endpoint
│   │   ├── agents/
│   │   │   ├── inventory-analyst/   ← POST запуск + GET статус всіх агентів
│   │   │   ├── channel-analytics/   ← POST запуск
│   │   │   ├── product-attributes/  ← POST запуск
│   │   │   ├── repricing/           ← POST запуск
│   │   │   ├── reordering/          ← POST запуск
│   │   │   ├── commercial-marketer/ ← POST запуск
│   │   │   ├── calendar-agent/      ← POST запуск
│   │   │   ├── campaign-analysis/   ← POST запуск
│   │   │   └── weekly-report/       ← POST запуск
│   │   ├── analyst/classify/
│   │   ├── calendar/
│   │   │   ├── events/              ← CRUD + PATCH
│   │   │   ├── events/[id]/         ← PATCH для редагування
│   │   │   ├── stock/               ← WOH по брендах
│   │   │   ├── insights/            ← data-driven інсайти
│   │   │   └── ai-plan/             ← POST → Claude генерує план
│   │   ├── onboarding/
│   │   ├── planner/                 ← brands, catalogs/upload, items, cart, duplicates
│   │   └── sync/drive/              ← POST тригер синку
│   └── layout.tsx                   ← root: ThemeProvider + LanguageProvider
├── components/
│   ├── analyst/AnalystApp.tsx        ← пагінація, AI chat зверху, фільтри
│   ├── calendar/MarketingCalendar.tsx ← динамічні тижні, expand/collapse, CRUD
│   ├── dashboard/SalesSparkline.tsx
│   ├── planner/PlannerApp.tsx
│   ├── settings/
│   │   ├── OnboardingForm.tsx
│   │   ├── DriveSyncCard.tsx
│   │   ├── AIProviderCard.tsx        ← глобальний провайдер
│   │   ├── AgentProvidersCard.tsx    ← per-agent Anthropic/OpenAI toggle
│   │   └── SettingsTabs.tsx          ← таби Загальне/Агенти
│   ├── Sidebar.tsx                   ← nav + ThemeToggle + LangToggle
│   ├── LanguageProvider.tsx
│   ├── ThemeProvider.tsx
│   └── TokenRefreshProvider.tsx
├── lib/
│   ├── ai.ts                         ← chat() → Claude/OpenAI, providerOverride
│   ├── analyst-types.ts
│   ├── attribute-metrics.ts          ← STR по категоріях, підтримує asOf?
│   ├── auth.ts
│   ├── brand-metrics.ts              ← WOH/STR/Trend/GM по брендах, підтримує asOf?
│   ├── channel-metrics.ts            ← продажі grouped by channel, підтримує asOf?
│   ├── classify.ts
│   ├── fetch.ts
│   ├── gdrive.ts                     ← syncFromDrive() + CatalogItem sync
│   ├── prisma.ts
│   ├── server-auth.ts
│   ├── translations.ts
│   └── utils.ts
├── middleware.ts
├── prisma/schema.prisma
└── railway.toml
```

---

## База даних — Prisma Schema

### Всі моделі

| Модель | Призначення |
|---|---|
| `Tenant` | Центральна. Всі FK з `onDelete: Cascade` |
| `User` | Auth, ролі: SUPER_ADMIN/ADMIN/ANALYST/VIEWER |
| `OnboardingBrief` | SEASONAL/CARRYOVER/HYBRID + JSON відповідей |
| `Brand` | Постачальник. `leadTimeDays` — для класифікації стокаутів |
| `Sku` | Наш інвентар для аналітики. `@@unique([tenantId, sku])` |
| `SalesRecord` | Продажі: date, qtySold, revenue, channel, isPromo |
| `InventorySnapshot` | Залишки: qtyOnHand, snapshotDate |
| `PromoEvent` | Промо-акції |
| `GoogleDriveSync` | Метадані останнього синку |
| `CatalogUpload` | Завантажені каталоги від постачальників |
| `CatalogItem` | Позиції каталогу (те що можна замовити) — заповнюється Drive sync |
| `MarketingEvent` | Події календаря. source: user/agent/system |
| `PlannerCart` | Кошик замовлень, один на tenant |
| `AgentRun` | Результати запусків агентів |

### AgentRun

```prisma
model AgentRun {
  id         String    @id @default(cuid())
  tenantId   String
  agentType  String    // "inventory_analyst" | "channel_analytics" | "product_attributes"
                       // "repricing" | "reordering" | "commercial_marketer"
                       // "calendar_agent" | "campaign_analysis" | "weekly_report"
  entityId   String    @default("all")
  status     String    // "running" | "done" | "error"
  input      Json      @default("{}")  // { provider: "anthropic"|"openai", asOf?: "YYYY-MM-DD" }
  output     Json?     // результат агента (містить _debug з промтами і сирим ответом AI)
  errorMsg   String?
  startedAt  DateTime  @default(now())
  finishedAt DateTime?
}
```

### SalesRecord.channel

- `"online"` — з ZAVOD_API (orderTime + product.sku)
- `"offline"` — з ARTICLE REPORT (місячні продажі, "Sales Last week")
- `"unknown"` — якщо не вказано

### CatalogUpload.season (автодетекція при Drive sync)

- `"SS26 (Drive)"` — якщо синк відбувається у березні-серпні
- `"AW26 (Drive)"` — якщо синк відбувається у вересні-лютому

---

## Змінні середовища Railway

| Variable | Значення | Обов'язково |
|---|---|---|
| `DATABASE_URL` | Автоматично від Railway PostgreSQL | ✅ |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 32` | ✅ |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 32` (інший!) | ✅ |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | ✅ для Anthropic агентів |
| `OPENAI_API_KEY` | `sk-...` | якщо використовується OpenAI |
| `AI_PROVIDER` | `anthropic` або `openai` | (за замовч. anthropic) |
| `GOOGLE_DRIVE_FILE_ID` | ID файлу з URL: `/d/{ID}/` | якщо Drive sync |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | `base64(service-account.json)` | якщо SA режим / експорт у Sheets |
| `GOOGLE_DRIVE_EXPORT_FOLDER_ID` | ID папки, розшареної на email сервіс-акаунта | рекомендовано для експорту в Sheets |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.railway.app` | рекомендовано |

> **Важливо:** Без `ANTHROPIC_API_KEY` агенти повернуть помилку _"Could not resolve authentication method"_. Ключ береться на [console.anthropic.com](https://console.anthropic.com).

### Якщо Railway PostgreSQL впав

Помилка: `P1001: Can't reach database server at postgres.railway.internal:5432`

**Рішення:**
1. Railway dashboard → видалити PostgreSQL сервіс
2. `+ New` → `Database` → `Add PostgreSQL`
3. Скопіювати нову `DATABASE_URL` в Variables апп-сервісу
4. Редеплой — `prisma db push` пересоздасть всі таблиці автоматично
5. Налаштування → Drive Sync → запустити синк для відновлення даних

---

## Запуск локально

```bash
npm install
cp .env.example .env        # заповнити DATABASE_URL, JWT secrets, AI keys
npm run db:push             # sync схема з БД
npm run dev                 # http://localhost:3000
```

**npm scripts:**
```
npm run dev        → next dev
npm run build      → prisma generate && next build
npm run start      → next start
npm run db:push    → prisma db push
npm run db:studio  → prisma studio
```

---

## Деплой на Railway

1. Push в GitHub (main branch)
2. New Project → Deploy from GitHub
3. Add PostgreSQL → `DATABASE_URL` підставляється автоматично
4. Variables → додати всі ключі
5. Deploy (автоматично при push)

**railway.toml:**
```toml
[build]
buildCommand = "npm run build"

[deploy]
startCommand = "npx prisma db push && npm run start"
```

> **Не використовувати `output: standalone`** — спричиняє 502 через HOSTNAME binding в Railway.

---

## Важливі нюанси

### Multi-tenancy
- **Завжди** `where: { tenantId }` в Prisma запитах
- Server Components: `const tenantId = (await headers()).get("x-tenant-id")!`
- Client Components не знають tenantId — все через API routes

### Як додати новий агент

1. Написати `lib/<name>-metrics.ts` — SQL запити, AI не рахує математику. Підпис: `async function get<Name>Metrics(tenantId: string, asOf?: Date)`
2. Написати `app/api/agents/<name>/route.ts`:
   - Парсити `body.provider` і `body.asOf` з request
   - Створити `AgentRun` з `input: { provider, asOf }`
   - Викликати `chat()` з `providerOverride`
   - Додати `_debug: { systemPrompt, userPrompt, rawResponse, provider, model, parsedSuccessfully, asOf, analyzedAt }` до output
   - Зберегти в `AgentRun.output`
3. Додати в масив `AGENTS` у `app/(app)/agents/page.tsx` з `runnable: true`
4. Додати route в `AGENT_ROUTES`
5. Додати в `AgentProvidersCard.tsx`

### Per-agent провайдер

```typescript
// Читання (в будь-якому client component)
import { getAgentProvider } from "@/components/settings/AgentProvidersCard"
const provider = getAgentProvider("inventory_analyst") // "anthropic" | "openai"

// Передача в API
fetch("/api/agents/inventory-analyst", {
  method: "POST",
  body: JSON.stringify({ provider, asOf: "2026-05-01" }) // asOf — опціонально
})

// В API route
const body = await req.json()
const providerOverride = body.provider
const asOf = body.asOf ? new Date(body.asOf) : undefined
await chat({ ..., providerOverride })
```

### Drive Sync — формати аркушів

| Аркуш | Що робить | Ключові колонки |
|---|---|---|
| `ARTICLE REPORT` | SKU + склад + місячні продажі + CatalogItem | Article, Brand, Stock units, 1-12, Sales Last week |
| `ZAVOD_API` | Транзакції онлайн-замовлень | product.sku, orderTime, product.amount |

Інші аркуші — ігноруються.

### Теми — де можна зламати
- Tailwind утиліти типу `text-white` потребують override в `globals.css` для light mode
- Inline script в `<head>` читає `localStorage('mxmt_theme')` до гідратації — **не видаляти**

---

## Roadmap — що далі

### ✅ Зроблено

- [x] Auth + JWT auto-refresh + silent-refresh
- [x] Dashboard з реальними алертами + sparkline
- [x] Планер Асортименту (каталог + кошик + AI + PO export)
- [x] Маркетинговий Календар (динамічні тижні + UA свята + AI план + CRUD)
- [x] Агент Аналітик (5 флагів + пагінація + AI chat)
- [x] Google Drive sync (ARTICLE REPORT + ZAVOD_API + CatalogItem)
- [x] Теми dark/light (no-flash SSR)
- [x] Система агентів — сторінка /agents з pipeline
- [x] AgentRun DB модель — трекінг всіх запусків
- [x] **Всі 9 агентів** — Inventory, Channel, Attributes, Repricing, Reordering, Marketer, Calendar, Campaign, Weekly
- [x] Per-agent провайдер (Anthropic/OpenAI per-агент)
- [x] **Трасування агентів** — `_debug` поле + DebugModal з промтами і сирим ответом
- [x] **Дата аналізу `asOf`** — дата-пікер + застереження + передача в всі 9 агентів
- [x] **CatalogItem з Drive sync** — Планер бачить товари з файлу Google Drive
- [x] **Період даних «від–до»** — `dateFrom` у всіх 9 агентах, метрики за власний період, тренд по половинах
- [x] **Розрахунок акції (Repricing)** — детермінована таблиця по SKU + експорт у Google Sheets (живі формули) та Excel

### 🚧 Наступні кроки

**Автоматизація:**
- [ ] Cron-задачі: запуск агентів 1-3 щодня о 08:00 (Railway cron або `/api/cron/daily`)
- [ ] AnalyticsConfig модель — пороги WOH/STR/GM per tenant (зараз хардкод)
- [ ] Telegram webhook для CRITICAL брендів

**Покращення агентів:**
- [ ] Channel Analytics — показувати канали з 0 продаж за 7д (union з 30д даних)
- [ ] Trend — збільшити горизонт або додати 30d trend паралельно
- [ ] InventorySnapshot — щоденне автоматичне збереження (для точного `asOf`)

**Нові модулі:**
- [ ] Рахунки/Інвойси (`/invoices`)
- [ ] Промо-калькулятор (32 механіки)

---

*MXMT Analytics · Next.js 15 + PostgreSQL + Prisma + Claude Sonnet/Haiku + OpenAI · Railway*  
*Актуально станом на 2026-06-01*
