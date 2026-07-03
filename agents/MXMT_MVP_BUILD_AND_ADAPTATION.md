# МXMT MVP: ДОРОЖНАЯ КАРТА СБОРКИ И АДАПТАЦИИ АГЕНТОВ

---

## 📋 ЧАСТЬ 1: СОБРАТЬ MVP (2-3 недели)

### ШАГИ СБОРКИ

#### **ШАГ 1: БД + SQL (день 1-2)**

```sql
-- 1. Таблица сырых данных
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  brand_id VARCHAR(50),
  sku_id VARCHAR(100),
  quantity INT,
  revenue DECIMAL(10,2),
  cost DECIMAL(10,2),
  channel VARCHAR(50),
  created_at TIMESTAMP,
  color VARCHAR(50),
  size VARCHAR(10)
);

-- 2. Materialized View с готовыми метриками
CREATE MATERIALIZED VIEW brand_analytics AS
SELECT 
  b.id as brand_id,
  b.name,
  -- WOH (Days on Hand)
  ROUND(
    CAST(SUM(i.qty) AS FLOAT) / 
    GREATEST(AVG(daily_sales.qty)::FLOAT, 0.1),
    1
  ) AS woh_days,
  
  -- STR (Sales Turnover Ratio %)
  ROUND(
    CAST(SUM(CASE 
      WHEN t.created_at >= NOW() - INTERVAL '7 days' 
      THEN t.quantity ELSE 0 
    END) AS FLOAT) / GREATEST(SUM(i.qty)::FLOAT, 1) * 100,
    1
  ) AS str_percent,
  
  -- GM (Gross Margin %)
  ROUND(
    (SUM(t.revenue) - SUM(t.cost)) / 
    GREATEST(SUM(t.revenue), 1) * 100,
    1
  ) AS gm_percent,
  
  -- Trend (7-day %)
  ROUND(
    (SUM(CASE 
      WHEN t.created_at >= NOW() - INTERVAL '7 days' 
      THEN t.quantity ELSE 0 
    END) - SUM(CASE 
      WHEN t.created_at >= NOW() - INTERVAL '14 days' 
      AND t.created_at < NOW() - INTERVAL '7 days'
      THEN t.quantity ELSE 0 
    END)) / GREATEST(SUM(CASE 
      WHEN t.created_at >= NOW() - INTERVAL '14 days' 
      AND t.created_at < NOW() - INTERVAL '7 days'
      THEN t.quantity ELSE 0 
    END), 1) * 100,
    1
  ) AS trend_percent,
  
  SUM(i.qty * p.cost) AS frozen_capital_uah,
  NOW() AS calculated_at
FROM brands b
LEFT JOIN products p ON b.id = p.brand_id
LEFT JOIN inventory i ON p.id = i.product_id
LEFT JOIN transactions t ON p.id = t.product_id
LEFT JOIN (
  SELECT brand_id, DATE(created_at), COUNT(*) as qty
  FROM transactions
  GROUP BY brand_id, DATE(created_at)
) daily_sales ON b.id = daily_sales.brand_id
GROUP BY b.id, b.name;

-- 3. Seasonal profiles (твои собственные пороги)
CREATE TABLE seasonal_profiles (
  id SERIAL PRIMARY KEY,
  brand_id VARCHAR(50),
  category VARCHAR(100),
  peak_months INT[],           -- [5,6,7,8] для летних платьев
  shoulder_months INT[],        -- [4,9]
  off_months INT[],             -- [10,11,12,1,2,3]
  woh_red_peak INT,             -- 80 для летних в пик
  woh_yellow_peak INT,          -- 60
  str_expected_peak DECIMAL,    -- 22 для летних в пик
  str_expected_shoulder DECIMAL,-- 10
  str_expected_off DECIMAL,     -- 1
  gm_target DECIMAL             -- 45
);
```

**Результат:** Все метрики (WOH, STR, GM, Trend) считаются в БД. ИИ их только получает.

---

#### **ШАГ 2: FastAPI endpoints (день 3-4)**

```python
# app/api/v1/agents.py

from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI()

# ========== INPUT/OUTPUT SCHEMAS ==========

class MetricsInput(BaseModel):
    brand_id: str
    woh_days: float
    str_percent: float
    trend_7d_percent: float
    gm_percent: float
    woh_red_threshold: float
    str_expected: float

class InventoryAnalystOutput(BaseModel):
    brand_id: str
    status: str  # critical | warning | balanced | excellent
    analysis: str
    confidence: float
    suggested_actions: List[str]
    urgency: str

# ========== ENDPOINTS ==========

@app.post("/agents/inventory-analyst")
async def inventory_analyst(input_data: MetricsInput) -> InventoryAnalystOutput:
    """
    Анализ метрик бренда → статус + рекомендации
    """
    from app.agents import InventoryAnalystAgent
    
    agent = InventoryAnalystAgent()
    result = agent.analyze(input_data.dict())
    
    return InventoryAnalystOutput(**result)

@app.post("/agents/repricing-strategy")
async def repricing_strategy(input_data: MetricsInput) -> dict:
    """
    Генерирует 3 варианта уценки + оценку каждого
    """
    from app.agents import RepricingStrategyAgent
    
    agent = RepricingStrategyAgent()
    result = agent.generate_options(input_data.dict())
    
    return result

@app.post("/agents/commercial-marketer")
async def commercial_marketer(pm_decision: dict, channel_data: dict) -> dict:
    """
    Переводит решение PM в briefs по каналам
    """
    from app.agents import CommercialMarketerAgent
    
    agent = CommercialMarketerAgent()
    result = agent.create_briefs(pm_decision, channel_data)
    
    return result

# ... остальные endpoints для 9 агентов
```

**Результат:** API готов вызывать агентов.

---

#### **ШАГ 3: Агент-обработчики (день 5-7)**

```python
# app/agents/base_agent.py

from anthropic import Anthropic
import json

class BaseAgent:
    def __init__(self, model: str = "claude-sonnet-4-20250514"):
        self.client = Anthropic()
        self.model = model
    
    def call_claude(self, system_prompt: str, user_message: str) -> dict:
        """
        Вызвать Claude с системным промптом и сообщением пользователя
        """
        response = self.client.messages.create(
            model=self.model,
            max_tokens=2000,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_message}
            ]
        )
        
        # Парсить JSON ответ
        response_text = response.content[0].text
        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            raise ValueError(f"Invalid JSON from agent: {response_text}")

# app/agents/inventory_analyst.py

from app.agents.base_agent import BaseAgent

class InventoryAnalystAgent(BaseAgent):
    def __init__(self):
        super().__init__(model="claude-sonnet-4-20250514")  # Sonnet
        self.system_prompt = """Ты аналитик склада в fashion retail.

Твоя задача: получив готовые метрики, определить статус бренда.

ФОРМАТ ОТВЕТА — строго JSON:
{
  "brand_id": "string",
  "status": "critical | warning | balanced | excellent",
  "analysis": "string",
  "confidence": 0.95,
  "suggested_actions": ["repricing", "reordering"],
  "urgency": "immediate | today | this_week"
}

ПРАВИЛА СТАТУСА:
- CRITICAL: WOH > WOH_RED И (STR < STR_EXPECTED × 0.5 ИЛИ Trend < -20%)
- WARNING: WOH > WOH_YELLOW ИЛИ STR ниже на 20-50% ИЛИ Trend падает 10-20%
- BALANCED: WOH между YELLOW и GREEN, STR близко к expected
- EXCELLENT: WOH < 20 И Trend +20%+"""
    
    def analyze(self, metrics: dict) -> dict:
        """
        Анализ метрик бренда
        """
        user_message = f"""
Проанализируй метрики бренда:
- WOH: {metrics['woh_days']} дней (RED threshold: {metrics['woh_red_threshold']})
- STR: {metrics['str_percent']}% (expected: {metrics['str_expected']}%)
- Trend: {metrics['trend_7d_percent']}%
- GM: {metrics['gm_percent']}%

Выдай JSON результат анализа."""
        
        return self.call_claude(self.system_prompt, user_message)

# app/agents/repricing_strategy.py

class RepricingStrategyAgent(BaseAgent):
    def __init__(self):
        super().__init__(model="claude-sonnet-4-20250514")
        self.system_prompt = """Ты стратег по ценообразованию.

Генерируешь 3 варианта уценки: AGGRESSIVE, BALANCED, CONSERVATIVE.
Каждый вариант включает forecast + evaluation (score, pros, cons, risks).

ФОРМАТ ОТВЕТА — строго JSON:
{
  "options": [
    {
      "option_id": 1,
      "strategy_type": "AGGRESSIVE",
      "label": "string",
      "discount_percent": 35,
      "forecast": {...},
      "evaluation": {
        "score": 8,
        "pros": [...],
        "cons": [...],
        "risks": [...],
        "recommended": true
      }
    },
    {...}, {...}
  ]
}"""
    
    def generate_options(self, metrics: dict) -> dict:
        user_message = f"""
Предложи 3 варианта уценки для {metrics['brand_id']}:
WOH: {metrics['woh_days']}, STR: {metrics['str_percent']}%, Trend: {metrics['trend_7d_percent']}%"""
        
        return self.call_claude(self.system_prompt, user_message)

# ... аналогично для остальных 7 агентов
```

**Результат:** Все 9 агентов реализованы и вызываются через API.

---

#### **ШАГ 4: Frontend (день 8-10)**

```typescript
// app/components/InventoryDashboard.tsx

import { useEffect, useState } from 'react';

export default function InventoryDashboard() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Загрузить метрики для всех брендов
    fetch('/api/v1/metrics')
      .then(r => r.json())
      .then(data => {
        // Для каждого бренда вызвать Inventory Analyst
        Promise.all(
          data.brands.map(brand =>
            fetch('/api/v1/agents/inventory-analyst', {
              method: 'POST',
              body: JSON.stringify(brand)
            }).then(r => r.json())
          )
        ).then(setBrands);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard">
      <h1>MXMT — Inventory Analytics</h1>
      {loading ? (
        <p>Анализирую бренды...</p>
      ) : (
        <div className="brands-grid">
          {brands.map(brand => (
            <div key={brand.brand_id} className={`brand-card ${brand.status}`}>
              <h2>{brand.brand_id}</h2>
              <p>{brand.analysis}</p>
              <div className="actions">
                {brand.suggested_actions.includes('repricing') && (
                  <button onClick={() => showRepricingOptions(brand.brand_id)}>
                    Варианты уценки
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function showRepricingOptions(brandId: string) {
  const response = await fetch('/api/v1/agents/repricing-strategy', {
    method: 'POST',
    body: JSON.stringify({ brand_id: brandId })
  });
  const options = await response.json();
  // Показать модаль с 3 вариантами
}
```

**Результат:** MVP готов к тестированию.

---

## 📊 ЧАСТЬ 2: ОБУЧИТЬ АГЕНТОВ ТВОИМ КРИТЕРИЯМ

### УРОВЕНЬ 1: Простые правила (меняешь промпт)

**Сценарий:** Тебе нужно чтобы Inventory Analyst учитывал **твой собственный порог CRITICAL**

**Было в промпте:**
```
CRITICAL: WOH > 80 И STR < 11%
```

**Твой критерий:**
```
CRITICAL: WOH > 100 И STR < 3% И Trend < -15%
```

**Что менять:**
```python
# app/agents/inventory_analyst.py

class InventoryAnalystAgent(BaseAgent):
    def __init__(self, client_id: str = None):
        super().__init__()
        
        # Загрузить твои пороги из БД
        if client_id:
            self.thresholds = self.load_client_thresholds(client_id)
        else:
            self.thresholds = self.load_default_thresholds()
        
        self.system_prompt = f"""Ты аналитик склада.

ТВОИ СОБСТВЕННЫЕ ПОРОГИ КРИТИЧНОСТИ:
- WOH RED: {self.thresholds['woh_red']} дней
- STR MIN: {self.thresholds['str_min']}%
- TREND MIN: {self.thresholds['trend_min']}%

ПРАВИЛО CRITICAL (твоё):
WOH > {self.thresholds['woh_red']} И STR < {self.thresholds['str_min']}% И Trend < {self.thresholds['trend_min']}%

Выдай JSON результат."""
    
    def load_client_thresholds(self, client_id: str):
        # Загрузить из таблицы client_custom_thresholds
        return {
            'woh_red': 100,
            'str_min': 3,
            'trend_min': -15
        }
```

**Результат:** Агент учитывает твои критерии. Промпт переиспользуется без переобучения.

---

### УРОВЕНЬ 2: Few-shot примеры (добавляешь примеры в промпт)

**Сценарий:** Agenta должен понять **твои собственные правила уценки для летних платьев**

**Твой критерий:**
```
Летние платья в июле-августе (пик-сезон):
- Если WOH > 100 → FLASH_SALE -25% (не -35 как в стандартном примере!)
- Если Trend падает в пик → CLEARANCE -40% (не -50!)
```

**Что менять:**
```python
class RepricingStrategyAgent(BaseAgent):
    def __init__(self, client_id: str = None):
        super().__init__()
        
        # Загрузить твои примеры из БД
        self.custom_examples = self.load_client_examples(client_id) if client_id else []
        
        self.system_prompt = f"""Ты стратег по ценообразованию.

Генерируешь 3 варианта уценки для каждого бренда.

ПРИМЕРЫ УСПЕШНЫХ КАМПАНИЙ (твои реальные данные):

{self._format_examples()}

Используй эти примеры как референс для своих рекомендаций.

ФОРМАТ ОТВЕТА — строго JSON..."""
    
    def _format_examples(self) -> str:
        """Форматировать твои примеры в промпт"""
        examples = []
        for ex in self.custom_examples:
            examples.append(f"""
Пример: {ex['brand']} (летние платья, пик-сезон)
- WOH: {ex['woh']} дней
- STR: {ex['str']}%
- Решение: {ex['action']} {ex['discount']}%
- Результат: продано {ex['units_sold']}%, выручка ₴{ex['revenue']}
- Roi: {ex['roi']}x
- Lesson: {ex['lesson']}
""")
        return "\n".join(examples)
    
    def load_client_examples(self, client_id: str):
        # Загрузить из таблицы campaign_results где успех > 90%
        # SELECT * FROM campaign_results WHERE client_id = client_id AND success_rate > 0.9
        return [
            {
                'brand': 'ZAVOD',
                'woh': 120,
                'str': 2.1,
                'action': 'FLASH_SALE',
                'discount': 25,  # не 35!
                'units_sold': 42,
                'revenue': 504000,
                'roi': 3.4,
                'lesson': 'В летних платьях 25% достаточно, не нужна глубокая скидка'
            }
        ]
```

**Результат:** Агент учится на твоих реальных успехах. Не нужно fine-tuning.

---

### УРОВЕНЬ 3: Eval framework (тестируешь качество)

**Сценарий:** Ты хочешь проверить что твой Repricing Agent дает **хорошие рекомендации** по **твоим критериям**

```python
# tests/test_agents.py

import json
from app.agents import RepricingStrategyAgent

class TestRepricingAgent:
    
    def test_summer_dresses_peak_season(self):
        """
        Тест: летние платья в пик-сезон (июль)
        Ожидаемо: FLASH_SALE -25% (по твоему критерию)
        """
        agent = RepricingStrategyAgent(client_id="zavod")
        
        input_data = {
            "brand_id": "zavod",
            "woh_days": 119,
            "str_percent": 2.1,
            "trend_7d_percent": -8,
            "gm_percent": 32,
            "seasonality": "peak_season",
            "category": "летние платья"
        }
        
        result = agent.generate_options(input_data)
        
        # Проверить что:
        assert len(result['options']) == 3, "Должно быть 3 варианта"
        
        recommended = [o for o in result['options'] if o['evaluation']['recommended']]
        assert len(recommended) == 1, "Должен быть 1 рекомендуемый вариант"
        
        rec = recommended[0]
        # ✅ Твой критерий: скидка 25% в пик-сезон для летних платьев
        assert 20 <= rec['discount_percent'] <= 30, f"Скидка должна быть ~25%, получили {rec['discount_percent']}"
        assert rec['evaluation']['score'] >= 7, "Оценка должна быть >= 7"
        
        print(f"✅ PASS: Рекомендуемый вариант {rec['label']} с оценкой {rec['evaluation']['score']}")
    
    def test_off_season_clearance(self):
        """
        Тест: зимний товар в апреле (off-season)
        Ожидаемо: CLEARANCE -50%+ (по твоему критерию)
        """
        agent = RepricingStrategyAgent(client_id="zavod")
        
        input_data = {
            "brand_id": "zavod",
            "woh_days": 150,
            "str_percent": 1.5,
            "trend_7d_percent": -20,
            "seasonality": "off_season"
        }
        
        result = agent.generate_options(input_data)
        
        recommended = [o for o in result['options'] if o['evaluation']['recommended']][0]
        # ✅ Твой критерий: clearance в off-season
        assert recommended['action'] == 'CLEARANCE'
        assert recommended['discount_percent'] >= 50

# Запуск тестов
if __name__ == "__main__":
    test = TestRepricingAgent()
    
    print("\n=== ТЕСТИРОВАНИЕ REPRICING AGENT ===\n")
    
    try:
        test.test_summer_dresses_peak_season()
    except AssertionError as e:
        print(f"❌ FAIL: {e}")
    
    try:
        test.test_off_season_clearance()
    except AssertionError as e:
        print(f"❌ FAIL: {e}")
```

**Запуск:**
```bash
python -m pytest tests/test_agents.py -v

# Результат:
# tests/test_agents.py::TestRepricingAgent::test_summer_dresses_peak_season PASSED
# tests/test_agents.py::TestRepricingAgent::test_off_season_clearance PASSED
```

**Результат:** Ты видишь какой агент работает по твоим критериям, какой нет.

---

### УРОВЕНЬ 4: Feedback loop (учишься на ошибках)

**Сценарий:** Когда кампания закончилась, ты хочешь **улучшить агента** на основе **реальных результатов**

```python
# app/feedback_loop.py

from sqlalchemy import create_engine
from datetime import datetime

class FeedbackLoop:
    def __init__(self):
        self.db = create_engine("postgresql://...")
    
    def record_campaign_result(self, campaign: dict):
        """
        Записать результат кампании в БД для анализа
        """
        from sqlalchemy.orm import Session
        session = Session(self.db)
        
        # Таблица campaign_results
        session.execute("""
            INSERT INTO campaign_results 
            (campaign_id, brand_id, pm_decision, agent_recommendation, 
             plan_vs_actual, success_rate, lessons_learned)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            campaign['id'],
            campaign['brand_id'],
            json.dumps(campaign['pm_decision']),
            json.dumps(campaign['agent_recommendation']),
            json.dumps({
                'planned_sold_percent': 40,
                'actual_sold_percent': 43,
                'planned_revenue': 480000,
                'actual_revenue': 516000
            }),
            0.93,  # Успех = 93%
            "Скидка 35% в летние платья в пик сработала отлично"
        ))
        session.commit()
    
    def get_successful_campaigns(self, client_id: str, category: str):
        """
        Загрузить успешные кампании для категории
        → использовать как few-shot примеры
        """
        result = self.db.execute("""
            SELECT * FROM campaign_results 
            WHERE client_id = %s 
            AND category = %s 
            AND success_rate > 0.90
            ORDER BY success_rate DESC
            LIMIT 5
        """, (client_id, category))
        
        return result.fetchall()
    
    def auto_update_agent_examples(self, agent_name: str, client_id: str):
        """
        Автоматически обновить примеры в промпте агента
        на основе последних успешных кампаний
        """
        successful_campaigns = self.get_successful_campaigns(client_id, category="летние платья")
        
        # Обновить промпт Repricing Agent новыми примерами
        new_system_prompt = self._generate_system_prompt_with_examples(
            agent_name,
            successful_campaigns
        )
        
        # Сохранить в БД
        self.db.execute("""
            UPDATE agent_configs 
            SET system_prompt = %s, updated_at = %s
            WHERE agent_name = %s AND client_id = %s
        """, (new_system_prompt, datetime.now(), agent_name, client_id))
```

**Результат:** Агент **автоматически учится** на твоих успешных кампаниях.

---

## 📈 ПОЛНЫЙ ЦИКЛ АДАПТАЦИИ

```
ДЕНЬ 1-10: Собрать MVP
├─ БД + SQL (готовые метрики)
├─ FastAPI endpoints
├─ 9 агентов с базовыми промптами
└─ Frontend

ДЕНЬ 11-15: Уровень 1 — твои пороги
├─ Загрузить твои собственные WOH RED, STR MIN, etc.
├─ Обновить промпты одной строчкой в коде
└─ Тестировать с реальными данными ZAVOD

ДЕНЬ 16-20: Уровень 2 — твои примеры
├─ Собрать последние 5 успешных кампаний ZAVOD
├─ Добавить их в few-shot примеры в промптах
└─ Агент начинает учиться на твоих данных

ДЕНЬ 21+: Уровень 3 & 4 — авто-обучение
├─ Написать unit тесты для проверки качества
├─ Установить feedback loop для сбора результатов
├─ Запустить авто-обновление примеров еженедельно
└─ Агенты эволюционируют на основе реальных данных
```

---

## 🎯 КОНКРЕТНЫЙ ПРИМЕР АДАПТАЦИИ

### Ты хочешь: "Repricing Agent должен НИКОГДА не скидывать больше чем 40% для ZAVOD в пик-сезон"

**Как добавить в промпт:**

```python
# app/agents/repricing_strategy.py

class RepricingStrategyAgent(BaseAgent):
    def __init__(self, client_id: str = None):
        super().__init__()
        
        # Загрузить твои business rules из БД
        self.business_rules = self.load_business_rules(client_id)
        
        self.system_prompt = f"""Ты стратег по ценообразованию.

{self._format_business_rules()}

ФОРМАТ ОТВЕТА — строго JSON:
{{
  "options": [...]
}}
"""
    
    def _format_business_rules(self) -> str:
        rules = []
        for rule in self.business_rules:
            rules.append(f"• {rule['description']}: {rule['rule']}")
        return "ТВОИ БИЗНЕС-ПРАВИЛА:\n" + "\n".join(rules)
    
    def load_business_rules(self, client_id: str):
        # Загрузить из таблицы client_business_rules
        return [
            {
                'description': 'Max discount in peak for ZAVOD',
                'rule': 'НИКОГДА не скидывать больше 40% для ZAVOD летние платья в пик-сезон'
            },
            {
                'description': 'Min margin threshold',
                'rule': 'GM не должна упасть ниже 15%'
            }
        ]
```

**Результат:** Агент НИКОГДА не выберет скидку > 40% для ZAVOD в пик-сезон.

---

## ✅ ИТОГОВЫЙ ОТВЕТ НА ТВОЙ ВОПРОС

### Вопрос: Смогу ли я собрать MVP и потом обучить агентов?

**ДА! И вот как:**

1. **Собрать MVP** — 2 недели максимум
   - У тебя есть все промпты
   - У тебя есть SQL queries
   - У тебя есть примеры JSON
   - Просто следуй шагам выше

2. **Обучить агентов своим критериям** — 1-3 недели
   - Уровень 1 (пороги): меняешь одну строчку в коде
   - Уровень 2 (примеры): загружаешь свои успешные кампании в few-shot
   - Уровень 3 (тесты): пишешь unit тесты чтобы проверять качество
   - Уровень 4 (авто-обучение): настраиваешь feedback loop

3. **Агенты эволюционируют** — автоматически
   - Каждая успешная кампания → новый пример в промпте
   - Каждый месяц → улучшенная версия агентов
   - Без fine-tuning
   - Без переобучения

---

## 🚀 ДАЛЬНЕЙШИЕ ШАГИ

**Неделя 1:** Собрать MVP по шагам выше
**Неделя 2:** Загрузить реальные данные ZAVOD и тестировать
**Неделя 3:** Добавить твои собственные пороги и примеры
**Неделя 4:** Запустить feedback loop и авто-обновление

**Через месяц:** У тебя будут агенты которые работают ТОЧНО под твои критерии.

**Готов начинать?** 💪
