# MXMT —ФІНАЛЬНА АРХІТЕКТУРА АГЕНТІВ

> Довідковий опис продуктової архітектури дев’яти агентів. Актуальна реалізація маршрутів і системних промптів знаходиться в `app/api/agents/*/route.ts`; цей документ не завантажується застосунком під час виконання.

## 🎯 ІТОГОВЕ РЕШЕННЯ: 9 агентів

Після аналізу критики та харчової логіки - **оптимальна кількість агентів = 9**.

---

## 📊 КРИТИЧНІ ВИПРАВЛЕННЯ

### ❌ Що було неправильно в 14-агентній структурі:

1. **ШІ вважав математику** (WOH, STR, Trend) → Haiku галюцинував
2. **Пари Strategy + Analysis** Було завищено → задвоє latency
3. **Forecast Agent** Дублював SQL → додатковий агент
4. **Buyer Agent** дублював Reordering → зайвий агент

### ✅ Те, що було виправлено в 9-агентній структурі:

1. **Вся математика у Postgre SQL** — ШІ отримує готові метрики
2. **Strategy агенти генерують варіанти + оцінюють їх відразу** — один крок замість двох
3. **Прибрати дублюючі агенти** (Forecast, Buyer, Dashboard Analysis)
4. **Haiku лише для категорій** — Channel Analytics, Product Attributes, Calendar
5. **Sonnet для складного аналізу** — Inventory Analyst, Repricing, Reordering, Commercial Marketer

---

## 🏗️ НОВА СТРУКТУРА (9 АГЕНТІВ)

### БЛОК 1: CORE ANALYTICS (автоматично кожного ранку)

#### **АГЕНТ 1: Invory Analyst Agent**
- **Модель:** Claude Sonnet 4
- **Коли:** 08:00 щодня
- **Вхід:** Завершені метрики SQL (WOH, STR, GM, Trend)
- **Вихід:** Стан кожного бренду (CRITICAL/WARNING/BALANCED) + первинні рекомендації
- **Завдання:** Аналіз усіх брендів → виділити критичні, попереджені про ризики

**Чому Sonnet:** Нам потрібен глибокий аналіз контексту (сонансність, тренди, аномалії)

---

#### **АГЕНТ 2: Channel Analytics Agent**
- **Модель:** Claude Haiku 4
- **Коли:** 08:30 Щодня
- **Вхід:** Продати за каналами (готові агрегати з SQL)
- **Вихід:** Порівняння каналів, best/worst performers, аномалії
- **Завдання:** Знайти де бренд продається краще (Prom.ua vs сайт vs магазин)

**Чому Haiku:** Проста категорія за жорсткими правилами (якщо Prom STR > Site STR × 2 → recommend Prom)

---

#### **АГЕНТ 3: Product Attributes Agent**
- **Модель:** Claude Haiku 4
- **Коли:** 08:30 Щодня
- **Вхід:** Продати за кольором/розміром/вариантом (готові агрегати SQL)
- **Вихід:** Bestsellers vs dead stock за атрибутами
- **Завдання:** Які кольори і розміри продаються, які залагоджуються

**Чому Haiku:** Категоризація по поріг (STR < 3% = dead, STR > 30% = bestseller)

---

### БЛОК 2: DECISION SUPPORT (за запитом PM)

#### **АГЕНТ 4: Repricing Strategy Agent**
- **Модель:** Claude Sonnet 4
- **Коли:** За вимогою PM (після перегляду Invtory Analyst)
- **Вхід:** Метрики бренду + сезонний контекст
- **Вихід:** 3 варіанти (AGRESSIVE/BALANCED/CONSERVATIVE) з оцінкою кожного
- **Завдання:** Сгенерувати варіанти оцінки І відразу оцінити плюси/мінуси/риски кожного

**ВАЖЛИВО:** Об'єднує старих агентів "Product Strategy" + "Repricing Analysis"

**Приклад JSON:**
```json
{
  "brand_id": "zavod",
  "options": [
    {
      "option_id": 1,
      "strategy": "AGGRESSIVE",
      "action": "FLASH_SALE",
      "discount": 35,
      "duration_days": 14,
      "forecast": {...},
      "evaluation": {
        "score": 8,
        "pros": ["Швидкий результат", "Без довгострокових зобов’язань"],
        "cons": ["Тимчасова втрата маржі"],
        "risks": ["Якщо STR не виросте за 3 дні, потрібно збільшити знижку"],
        "recommended": true
      }
    },
    {
      "option_id": 2,
      "strategy": "BALANCED",
      "action": "CLEARANCE",
      ...
    },
    {
      "option_id": 3,
      "strategy": "CONSERVATIVE",
      "action": "VISIBILITY",
      ...
    }
  ]
}
```

**Чому об’єднали:** PM бачить варіанти І їх оцінку відразу → може прийняти рішення за один крок

---

#### **АГЕНТ 5: Rordering Strategy Agent**
- **Модель:** Claude Sonnet 4
- **Коли:** За вимогою PM (для брендів з WOH < 30)
- **Вхід:** Метрики бренду + прогноз попиту
- **Вихід:** 3 сценарій (PESSIMISTIC/REALISTIC/OPTIMISTIC) з оцінкою ризиків кожного
- **Завдання:** Створити скрипти дозаказу І відразу оцінити фінансові ризики

**ВАЖЛИВО:** Об' єднує старих агентів "Reordering Strategy" + "Reordering Analysis"

**Приклад JSON:**
```json
{
  "brand_id": "chpo",
  "scenarios": [
    {
      "scenario_id": 1,
      "type": "PESSIMISTIC",
      "qty": 100,
      "cost_uah": 240000,
      "logic": "Закрити поточний тренд на 21 день",
      "woh_after": 20,
      "evaluation": {
        "score": 5,
        "risk_level": "HIGH",
        "risks": ["Stockout через 3 тижні якщо тренд прискориться"],
        "safety_margin": "LOW",
        "recommended": false
      }
    },
    {
      "scenario_id": 2,
      "type": "REALISTIC",
      "qty": 220,
      "cost_uah": 528000,
      "logic": "Вийти на WOH 45 днів",
      "woh_after": 45,
      "evaluation": {
        "score": 9,
        "risk_level": "LOW",
        "risks": ["Невеличний ризик перевищення якщо тренд сповільниться"],
        "safety_margin": "GOOD",
        "recommended": true
      }
    },
    {
      "scenario_id": 3,
      "type": "OPTIMISTIC",
      "qty": 350,
      "cost_uah": 840000,
      "logic": "Вийти на WOH 65 днів з урахуванням росту",
      "woh_after": 65,
      "evaluation": {
        "score": 7,
        "risk_level": "MEDIUM",
        "risks": ["Якщо прогноз не збудеться"],
        "safety_margin": "AGGRESSIVE",
        "recommended": false
      }
    }
  ]
}
```

**Чому об’єднали:** PM бачить скрипти і ризики відразу → може вибрати свідоме

---

### БЛОК 3: EXECUTION (після вибору PM)

#### **АГЕНТ 6: Commercial Marketer Agent**
- **Модель:** Claude Sonnet 4
- **Коли:** Відразу після вибору PM
- **Вхід:** Розв' язання PM + дані на каналах
- **Вихід:** Briefs за 5 каналами (SM, Email, Ads, Store, Marketplace)
- **Завдання:** Перевести рішення PM на зрозумілому маркетингу

**КРИТИЧНО ВАЖЛИВО:** НЕ використовуються терміни WOH, STR, GM — лише людська мова

---

#### **АГЕНТ 7: Calendar Agent**
- **Модель:** Claude Haiku 4
- **Коли:** Під час збереження подій + щоранку 08:00
- **Вхід:** Маркетинговий план + Commercial Marketer бриф
- **Вихід:** Анотації (gaps, conflicts, timing issues)
- **Завдання:** Порівняти що заплановано vs що потрібно

**Чому Haiku:** Простий порівняння двох списків за правилами

---

### БЛОК 4: TRACKING & REPORTING

#### **АГЕНТ 8: Campaign Analysis Agent**
- **Модель:** Claude Sonnet 4
- **Коли:**
  - Щогодини під час активних кампаній (проміжковий сигнал)
  - Під кінець кампанії (фінальний розбір)
- **Вхід:** Метрики кампанії (план vs факт)
- **Вихід:**
  - **Проміжковий:** Стан (on_track/slow/failing) + suggested action
  - **Фінальний:** Що спрацювало, що немає, lessons learned
- **Завдання:** Трекінг кампаній в реальному часі + post-mortem аналіз

**Чому Sonnet:** Потрібний глибокий аналіз причин успіху/ провала

---

#### **АГЕНТ 9: Weekly Report Generator**
- **Модель:** Claude Sonnet 4
- **Коли:** П’ятниця 16:00
- **Вхід:** Всі дані тижня (реші, кампанії, результати)
- **Вихід:**
  ```json
  {
    "pm_report": {
      "summary": "...",
      "kpis": {...},
      "decisions": [...],
      "recommendations": [...]
    },
    "marketing_brief": {
      "summary": "...",
      "campaigns": [...],
      "channel_performance": [...],
      "wins": [...],
      "losses": [...],
      "recommendations": [...]
    }
  }
  ```
- **Завдання:** Створити два звіти в одному JSON для щотижневого metting

**ВИПРАВДАННЯ JSON:** Обидва звіти обгорнуті в один кореневий об’ єкт

---

## 📋 ПОРІВНЯННЯ АРХІТЕКТУР

| Стара (14 агентів) | Нова (9 агентів) | Зміна |
|---------------------|-------------------|-----------|
| Forecast Agent | ❌ Видалений | SQL вважає передбачення |
| Buyer Agent | ❌ Видалений | Об’єднання з Reordering Strategy |
| Dashboard Analysis | ❌ Видалений | Об’єднання з Invtory Analyst |
| Product Strategy | ✅ → Repricing Strategy | Додано оцінки варіантів |
| Repricing Analysis | ❌ Видалений | Об’єднання з Repricing Strategy |
| Reordering Strategy | ✅ Залишився | Додано оцінки скриптів |
| Reordering Analysis | ❌ Видалений | Об’єднання з Reordering Strategy |
| Commercial Marketer | ✅ Залишився | Без змін |
| Marketing Strategy | ❌ Видалений | Використано |
| Campaign Analysis | ✅ Залишився | Без змін |
| Channel Analytics | ✅ Залишився | Sonnet → Haiku |
| Product Attributes | ✅ Залишився | Sonnet → Haiku |
| Calendar Relevance | ✅ Залишився | Без змін |
| Weekly Report | ✅ Залишився | Виправлений JSON |
| **Inventory Analyst** | ✅ **НОВИЙ** | Об’єднує Dashboard + первинний аналіз |

---

## 🔧 ТЕХНІЧНІ ВИПРАВЛЕННЯ

### 1. І НЕ ВВАЖАЄ МАТЕМАТИКУ

**ДО (погане):**
```python
# Передаємо ІІ сирі дані
agent_input = {
    "sales_history": [
        {"date": "2026-05-12", "units": 9},
        {"date": "2026-05-13", "units": 7},
        ...
    ]
}
# Haiku буде галюцинувати при розрахунку середнього
```

**ПІСЛЯ (правильно):**
```python
# SQL вже сприймав все в Materialized View
agent_input = {
    "brand_id": "zavod",
    "woh_days": 119,  # ← готовое значение из SQL
    "str_percent": 2.1,  # ← готовое значение
    "trend_7d_percent": -8,  # ← готовое значение
    "gm_percent": 32,  # ← готовое значение
    "woh_red_threshold": 80,  # ← из seasonal_profiles
    "str_expected": 22  # ← из seasonal_profiles
}
# ШІ тільки аналізує і інтерпретує
```

---

### 2) ВИПРАВЛЕННЯ JSON СТРУКТУР

**ДО (плосо — динамічні ключі):**
```json
{
  "discounts": {
    "BLACK": -25,
    "RED": -40,
    "BLUE": -15
  }
}
```
Проблема: Pydantic не може валідувати — ключі змінюються

**ПІСЛЯ (правильно — масив об’ єктів):**
```json
{
  "discounts": [
    {"attribute_value": "BLACK", "discount_percent": 25},
    {"attribute_value": "RED", "discount_percent": 40},
    {"attribute_value": "BLUE", "discount_percent": 15}
  ]
}
```
Pydantic схема:
```python
class DiscountItem(BaseModel):
    attribute_value: str
    discount_percent: int

class Response(BaseModel):
    discounts: List[DiscountItem]
```

---

### 3. ОБ’ЄДНАННЯ ДВОХ ЗВІТІВ У ОДИН JSON

**ДО (погане):**
```
Agent повинен видати PM ріпорт І Marketing Briof — дві різні структури
```
Проблема: FastAPI не може розпарити два JSON в одній відповіді

**ПІСЛЯ (правильно):**
```json
{
  "report_date": "2026-05-23",
  "week": "2026-W21",
  "pm_report": {
    "summary": "...",
    "kpis": {...},
    "decisions": [...],
    "anomalies": [...],
    "recommendations": [...]
  },
  "marketing_brief": {
    "summary": "...",
    "campaigns": [...],
    "channel_performance": [...],
    "wins": [...],
    "losses": [...],
    "recommendations": [...]
  }
}
```

---

## ⚡ FLOW ПРИКЛАД (ZAVOD CRITICAL)

### 08:00 — SQL оновлює Materialized View
```sql
REFRESH MATERIALIZED VIEW brand_analytics;
-- Результат: ZAVOD WOH=119, STR=2.1%, Trend=-8%, GM=32%
```

### 08:05 — Inventory Analyst Agent (Sonnet)
**Вхід:** Завершені метрики SQL
**Вихід:**
```json
{
  "brand_id": "zavod",
  "status": "CRITICAL",
  "analysis": "WOH 119 > RED (80). STR 2.1% << EXPECTED (22%). Falling trend in peak season.",
  "confidence": 0.95,
  "suggested_actions": ["repricing", "clearance"]
}
```

### 0:00 — PM переглядає dashboard
PM бачить: "ZAVOD CRITICAL - потрібна дія"

### 09:05 — PM визначає варіанти оцінки
PM клікає "Подивитися варіанти" → викликається **Repricing Strategy Agent**

### 09:06 — Repricing Strategy Agent (Sonnet)
**Вхід:** Метрики ZAVOD + сезонний контекст
**Вихід:** 3 варіанти З ОЦЕНКОЇ кожного (див. JSON вище)

### 09:10 — ПМ вибирає варіант
PM вибирає: "FLASH_SALE -35%, 14 днів"

### 09:11 — Commercial Marketer Agent (Sonnet)
**Вхід:** Розв' язання PM + channel data
**Вихід:** Britefs 5 каналів (без термінів WOH/STR/GM)

### 09:15 — Calendar Agent (Haiku)
**Вхід:** Маркетинговий план + Commercial brief
**Вихід:** Примітка (gap: Email ZAVOD не заплановано)

### 09:20 — Маркетолог бачить анотації
Маркетолог приймає suggesions → додає події до календаря

### 14 днів потому — Campaign Analysis Agent (Sonnet)
**Вихід:** Фінальний розбір (що спрацювало, що ні)

### П’ятниця 16:00 — Weekly ріпорт Generator (Sonnet)
**Вихід:** PM ріпорт + Marketing Britef в одному JSON

---

## 💰 & ВАРТІСТЬ ШВИДКОДІЇ

### Порівняння токенів (примірна оцінка на 1 бренд):

| Агент | Модель | Input tokens | Output tokens | Коштує/визує |
|-------|--------|--------------|---------------|-----------------|
| Inventory Analyst | Sonnet | 1500 | 500 | $0.012 |
| Channel Analytics | Haiku | 800 | 300 | $0.001 |
| Product Attributes | Haiku | 600 | 250 | $0.001 |
| Repricing Strategy | Sonnet | 2000 | 800 | $0.021 |
| Reordering Strategy | Sonnet | 1800 | 700 | $0.019 |
| Commercial Marketer | Sonnet | 2500 | 1000 | $0.026 |
| Calendar | Haiku | 1200 | 400 | $0.002 |
| Campaign Analysis | Sonnet | 3000 | 1200 | $0.032 |
| Weekly Report | Sonnet | 5000 | 2000 | $0.053 |

**Отже, 1 клієнт (5 брендів) щомісяця:**
- Щоденні агенти (1, 2, 3): $0.14 × 30 днів × 5 брендів = **$2.10**
- Decision support (4, 5): ~3 розв' язання/місяць × 5 брендів на $0.040 = **$0.60**
- Execution (6, 7): ~3 кампанії/місяц x $0.028 = **$0.08**
- Tracking (8): ~3 кампанії x 14 днів x $0.032 = **$1.34**
- Weekly reports (9): 4 тижні × $0.053 = **$0.21**

**ЗАВДЯКИ: ~$4.33/місяць на клієнта**

vs стара 14-агентна: **~ $12.50/місяць** (економія 65%)

---

## ✅ ОСТАТОЧНИЙ ВЕРДИКТ

### Чому 9 агентів оптимально:

1. ✅ **Убрана математика з ШІ** — все рахується у SQL
2. ✅ **Об’єднані Strategy + Analysis** — один виклик замість двох
3. ✅ **Haiku для категорій** — Channel, Attributes, Calendar
4. ✅ **Sonnet для аналізу** — Inventory, Repricing, Reordering, Commercial Marketer
5. ✅ **Збережені критичними функціями** — Campaign tracking, Weekly reports
6. ✅ **Виправлені JSON структури** — масиви замість динамічних ключів
7. ✅ **Знижена вартість на 65%** — з $12.50 до $4.33/місяць

### Чому НЕ 7, НЕ 10, а саме 9:

- **Не 7:** Campaign Analysis і Weekly ріпорт не можна прибрати - це критичні функції продукту
- **Не 10+:** Більше агентів = більше обгоргед без користі
- **9 — sweet spot:** Кожен агент робить одну чітку задачу, немає дублювання

---

## 🚀 ЗАТВЕРДЖЕНО ДО РЕАЛІЗАЦІЇ

Наступний крок: **Написати промпти для всіх 9 агентів** з врахуванням всіх виправлень.
