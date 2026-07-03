# MXMT — ФИНАЛЬНАЯ АРХИТЕКТУРА АГЕНТОВ

## 🎯 ИТОГОВОЕ РЕШЕНИЕ: 9 агентов

После анализа критики и продуктовой логики — **оптимальное количество агентов = 9**.

---

## 📊 КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ

### ❌ Что было неправильно в 14-агентной структуре:

1. **ИИ считал математику** (WOH, STR, Trend) → Haiku галлюцинировал
2. **Пары Strategy + Analysis** были избыточны → задвоение latency
3. **Forecast Agent** дублировал SQL → лишний агент
4. **Buyer Agent** дублировал Reordering → лишний агент

### ✅ Что исправлено в 9-агентной структуре:

1. **Вся математика в PostgreSQL** — ИИ получает готовые метрики
2. **Strategy агенты генерируют варианты + оценивают их сразу** — один шаг вместо двух
3. **Убраны дублирующие агенты** (Forecast, Buyer, Dashboard Analysis)
4. **Haiku только для категоризации** — Channel Analytics, Product Attributes, Calendar
5. **Sonnet для сложного анализа** — Inventory Analyst, Repricing, Reordering, Commercial Marketer

---

## 🏗️ НОВАЯ СТРУКТУРА (9 АГЕНТОВ)

### БЛОК 1: CORE ANALYTICS (автоматически каждое утро)

#### **АГЕНТ 1: Inventory Analyst Agent**
- **Модель:** Claude Sonnet 4
- **Когда:** 08:00 ежедневно
- **Вход:** Готовые метрики из SQL (WOH, STR, GM, Trend)
- **Выход:** Статус каждого бренда (CRITICAL/WARNING/BALANCED) + первичные рекомендации
- **Задача:** Анализ всех брендов → выделить критичные, предупредить о рисках

**Почему Sonnet:** Нужен глубокий анализ контекста (сезонность, тренды, аномалии)

---

#### **АГЕНТ 2: Channel Analytics Agent**
- **Модель:** Claude Haiku 4
- **Когда:** 08:30 ежедневно
- **Вход:** Продажи по каналам (готовые агрегаты из SQL)
- **Выход:** Сравнение каналов, best/worst performers, аномалии
- **Задача:** Найти где бренд продается лучше (Prom.ua vs сайт vs магазин)

**Почему Haiku:** Простая категоризация по жестким правилам (если Prom STR > Site STR × 2 → recommend Prom)

---

#### **АГЕНТ 3: Product Attributes Agent**
- **Модель:** Claude Haiku 4
- **Когда:** 08:30 ежедневно
- **Вход:** Продажи по цвету/размеру/варианту (готовые агрегаты из SQL)
- **Выход:** Bestsellers vs dead stock по атрибутам
- **Задача:** Какие цвета/размеры продаются, какие залёживаются

**Почему Haiku:** Категоризация по порогам (STR < 3% = dead, STR > 30% = bestseller)

---

### БЛОК 2: DECISION SUPPORT (по запросу PM)

#### **АГЕНТ 4: Repricing Strategy Agent**
- **Модель:** Claude Sonnet 4
- **Когда:** По требованию PM (после просмотра Inventory Analyst)
- **Вход:** Метрики бренда + сезонный контекст
- **Выход:** 3 варианта (AGGRESSIVE/BALANCED/CONSERVATIVE) с оценкой каждого
- **Задача:** Сгенерировать варианты уценки И сразу оценить плюсы/минусы/риски каждого

**ВАЖНО:** Объединяет старых агентов "Product Strategy" + "Repricing Analysis"

**Пример JSON:**
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
        "pros": ["Быстрый результат", "Без долгосрочных обязательств"],
        "cons": ["Временная потеря маржи"],
        "risks": ["Если STR не вырастет за 3 дня, нужно углубить скидку"],
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

**Почему объединили:** PM видит варианты И их оценку сразу → может принять решение за один шаг

---

#### **АГЕНТ 5: Reordering Strategy Agent**
- **Модель:** Claude Sonnet 4
- **Когда:** По требованию PM (для брендов с WOH < 30)
- **Вход:** Метрики бренда + прогноз спроса
- **Выход:** 3 сценария (PESSIMISTIC/REALISTIC/OPTIMISTIC) с оценкой рисков каждого
- **Задача:** Сгенерировать сценарии дозаказа И сразу оценить финансовые риски

**ВАЖНО:** Объединяет старых агентов "Reordering Strategy" + "Reordering Analysis"

**Пример JSON:**
```json
{
  "brand_id": "chpo",
  "scenarios": [
    {
      "scenario_id": 1,
      "type": "PESSIMISTIC",
      "qty": 100,
      "cost_uah": 240000,
      "logic": "Покрыть текущий тренд на 21 день",
      "woh_after": 20,
      "evaluation": {
        "score": 5,
        "risk_level": "HIGH",
        "risks": ["Stockout через 3 недели если тренд ускорится"],
        "safety_margin": "LOW",
        "recommended": false
      }
    },
    {
      "scenario_id": 2,
      "type": "REALISTIC",
      "qty": 220,
      "cost_uah": 528000,
      "logic": "Выйти на WOH 45 дней",
      "woh_after": 45,
      "evaluation": {
        "score": 9,
        "risk_level": "LOW",
        "risks": ["Небольшой риск переизбытка если тренд замедлится"],
        "safety_margin": "GOOD",
        "recommended": true
      }
    },
    {
      "scenario_id": 3,
      "type": "OPTIMISTIC",
      "qty": 350,
      "cost_uah": 840000,
      "logic": "Выйти на WOH 65 дней с учётом роста",
      "woh_after": 65,
      "evaluation": {
        "score": 7,
        "risk_level": "MEDIUM",
        "risks": ["Риск переизбытка ₴300K если прогноз не сбудется"],
        "safety_margin": "AGGRESSIVE",
        "recommended": false
      }
    }
  ]
}
```

**Почему объединили:** PM видит сценарии И риски сразу → может выбрать осознанно

---

### БЛОК 3: EXECUTION (после выбора PM)

#### **АГЕНТ 6: Commercial Marketer Agent**
- **Модель:** Claude Sonnet 4
- **Когда:** Сразу после выбора PM
- **Вход:** Решение PM + данные по каналам
- **Выход:** Briefs по 5 каналам (SMM, Email, Ads, Store, Marketplace)
- **Задача:** Перевести решение PM на понятный маркетингу язык

**КРИТИЧЕСКИ ВАЖНО:** НЕ использует термины WOH, STR, GM — только человеческий язык

---

#### **АГЕНТ 7: Calendar Agent**
- **Модель:** Claude Haiku 4
- **Когда:** При сохранении событий + каждое утро 08:00
- **Вход:** Маркетинговый план + Commercial Marketer бриф
- **Выход:** Аннотации (gaps, conflicts, timing issues)
- **Задача:** Сравнить что запланировано vs что нужно

**Почему Haiku:** Простое сравнение двух списков по правилам

---

### БЛОК 4: TRACKING & REPORTING

#### **АГЕНТ 8: Campaign Analysis Agent**
- **Модель:** Claude Sonnet 4
- **Когда:** 
  - Ежечасно во время активных кампаний (промежуточный сигнал)
  - В конце кампании (финальный разбор)
- **Вход:** Метрики кампании (план vs факт)
- **Выход:** 
  - **Промежуточный:** Статус (on_track/slow/failing) + suggested action
  - **Финальный:** Что сработало, что нет, lessons learned
- **Задача:** Трекинг кампаний в реальном времени + post-mortem анализ

**Почему Sonnet:** Нужен глубокий анализ причин успеха/провала

---

#### **АГЕНТ 9: Weekly Report Generator**
- **Модель:** Claude Sonnet 4
- **Когда:** Пятница 16:00
- **Вход:** Все данные недели (решения, кампании, результаты)
- **Выход:** 
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
- **Задача:** Создать два отчёта в одном JSON для еженедельного meeting

**ИСПРАВЛЕНИЕ JSON:** Оба отчёта обернуты в один корневой объект

---

## 📋 СРАВНЕНИЕ АРХИТЕКТУР

| Старая (14 агентов) | Новая (9 агентов) | Изменение |
|---------------------|-------------------|-----------|
| Forecast Agent | ❌ Удален | SQL считает прогнозы |
| Buyer Agent | ❌ Удален | Объединен с Reordering Strategy |
| Dashboard Analysis | ❌ Удален | Объединен с Inventory Analyst |
| Product Strategy | ✅ → Repricing Strategy | Добавлена оценка вариантов |
| Repricing Analysis | ❌ Удален | Объединен с Repricing Strategy |
| Reordering Strategy | ✅ Остался | Добавлена оценка сценариев |
| Reordering Analysis | ❌ Удален | Объединен с Reordering Strategy |
| Commercial Marketer | ✅ Остался | Без изменений |
| Marketing Strategy | ❌ Удален | Избыточен |
| Campaign Analysis | ✅ Остался | Без изменений |
| Channel Analytics | ✅ Остался | Sonnet → Haiku |
| Product Attributes | ✅ Остался | Sonnet → Haiku |
| Calendar Relevance | ✅ Остался | Без изменений |
| Weekly Report | ✅ Остался | Исправлен JSON |
| **Inventory Analyst** | ✅ **НОВЫЙ** | Объединяет Dashboard + первичный анализ |

---

## 🔧 ТЕХНИЧЕСКИЕ ИСПРАВЛЕНИЯ

### 1. ИИ НЕ СЧИТАЕТ МАТЕМАТИКУ

**ДО (плохо):**
```python
# Передаем ИИ сырые данные
agent_input = {
    "sales_history": [
        {"date": "2026-05-12", "units": 9},
        {"date": "2026-05-13", "units": 7},
        ...
    ]
}
# Haiku будет галлюцинировать при расчете среднего
```

**ПОСЛЕ (правильно):**
```python
# SQL уже посчитал всё в Materialized View
agent_input = {
    "brand_id": "zavod",
    "woh_days": 119,  # ← готовое значение из SQL
    "str_percent": 2.1,  # ← готовое значение
    "trend_7d_percent": -8,  # ← готовое значение
    "gm_percent": 32,  # ← готовое значение
    "woh_red_threshold": 80,  # ← из seasonal_profiles
    "str_expected": 22  # ← из seasonal_profiles
}
# ИИ только анализирует и интерпретирует
```

---

### 2. ИСПРАВЛЕНИЕ JSON СТРУКТУР

**ДО (плохо — динамические ключи):**
```json
{
  "discounts": {
    "BLACK": -25,
    "RED": -40,
    "BLUE": -15
  }
}
```
Проблема: Pydantic не может валидировать — ключи меняются

**ПОСЛЕ (правильно — массив объектов):**
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

### 3. ОБЪЕДИНЕНИЕ ДВУХ ОТЧЁТОВ В ОДИН JSON

**ДО (плохо):**
```
Agent должен выдать PM Report И Marketing Brief — две разные структуры
```
Проблема: FastAPI не может распарсить два JSON в одном ответе

**ПОСЛЕ (правильно):**
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

## ⚡ FLOW ПРИМЕРА (ZAVOD CRITICAL)

### 08:00 — SQL обновляет Materialized View
```sql
REFRESH MATERIALIZED VIEW brand_analytics;
-- Результат: ZAVOD WOH=119, STR=2.1%, Trend=-8%, GM=32%
```

### 08:05 — Inventory Analyst Agent (Sonnet)
**Вход:** Готовые метрики из SQL
**Выход:**
```json
{
  "brand_id": "zavod",
  "status": "CRITICAL",
  "analysis": "WOH 119 > RED (80). STR 2.1% << EXPECTED (22%). Falling trend in peak season.",
  "confidence": 0.95,
  "suggested_actions": ["repricing", "clearance"]
}
```

### 09:00 — PM просматривает dashboard
PM видит: "ZAVOD CRITICAL — нужно действие"

### 09:05 — PM запрашивает варианты уценки
PM кликает "Посмотреть варианты" → вызывается **Repricing Strategy Agent**

### 09:06 — Repricing Strategy Agent (Sonnet)
**Вход:** Метрики ZAVOD + сезонный контекст
**Выход:** 3 варианта С ОЦЕНКОЙ каждого (см. JSON выше)

### 09:10 — PM выбирает вариант
PM выбирает: "FLASH_SALE -35%, 14 дней"

### 09:11 — Commercial Marketer Agent (Sonnet)
**Вход:** Решение PM + channel data
**Выход:** Briefs по 5 каналам (без терминов WOH/STR/GM)

### 09:15 — Calendar Agent (Haiku)
**Вход:** Маркетинговый план + Commercial brief
**Выход:** Аннотации (gap: Email ZAVOD не запланирован)

### 09:20 — Маркетолог видит аннотации
Маркетолог принимает suggestions → добавляет события в календарь

### 14 дней спустя — Campaign Analysis Agent (Sonnet)
**Выход:** Финальный разбор (что сработало, что нет)

### Пятница 16:00 — Weekly Report Generator (Sonnet)
**Выход:** PM Report + Marketing Brief в одном JSON

---

## 💰 СТОИМОСТЬ & ПРОИЗВОДИТЕЛЬНОСТЬ

### Сравнение токенов (примерная оценка на 1 бренд):

| Агент | Модель | Input tokens | Output tokens | Стоимость/вызов |
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

**Итого на 1 клиента (5 брендов) в месяц:**
- Ежедневные агенты (1, 2, 3): $0.014 × 30 дней × 5 брендов = **$2.10**
- Decision support (4, 5): ~3 решения/месяц × 5 брендов × $0.040 = **$0.60**
- Execution (6, 7): ~3 кампании/месяц × $0.028 = **$0.08**
- Tracking (8): ~3 кампании × 14 дней × $0.032 = **$1.34**
- Weekly reports (9): 4 недели × $0.053 = **$0.21**

**ВСЕГО: ~$4.33/месяц на клиента**

vs старая 14-агентная: **~$12.50/месяц** (экономия 65%)

---

## ✅ ИТОГОВЫЙ ВЕРДИКТ

### Почему 9 агентов оптимально:

1. ✅ **Убрана математика из ИИ** — всё считается в SQL
2. ✅ **Объединены Strategy + Analysis** — один вызов вместо двух
3. ✅ **Haiku для категоризации** — Channel, Attributes, Calendar
4. ✅ **Sonnet для анализа** — Inventory, Repricing, Reordering, Commercial Marketer
5. ✅ **Сохранены критичные функции** — Campaign tracking, Weekly reports
6. ✅ **Исправлены JSON структуры** — массивы вместо динамических ключей
7. ✅ **Снижена стоимость на 65%** — с $12.50 до $4.33/месяц

### Почему НЕ 7, НЕ 10, а именно 9:

- **Не 7:** Campaign Analysis и Weekly Report нельзя убрать — это критичные функции продукта
- **Не 10+:** Больше агентов = больше оверхед без пользы
- **9 — sweet spot:** Каждый агент делает одну чёткую задачу, нет дублирования

---

## 🚀 ГОТОВО К РЕАЛИЗАЦИИ

Следующий шаг: **Написать промпты для всех 9 агентов** с учётом всех исправлений.
