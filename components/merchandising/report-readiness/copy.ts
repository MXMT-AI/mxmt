import type { Lang } from "@/lib/translations";

export const reportReadinessCopy = {
  "uk": {
    "missingStock": "SKU без підтвердженого залишку на дату знімка. Історичні записи збережені окремо; це не нульовий залишок.",
    "missingReceipt": "SKU без підтвердженої історії надходжень. Класифікація й STR недоступні.",
    "missingVelocity": "SKU без достатньої історії для швидкості продажів. WOH і дозамовлення недоступні.",
    "unknownOwnership": "товарних SKU без погодженої власності. Маржа й допуск до уцінки потребують правил бренду або товару.",
    "unknownKind": "SKU потребують перевірки типу товару.",
    "ariaLabel": "Що потрібно для повних звітів",
    "heading": "Що потрібно для повних звітів",
    "scope": "За всім джерелом у цьому знімку; поточні фільтри не змінюють ці лічильники. Оновлення перегляду не додає відсутню історію чи погодження.",
    "classificationWarning": "Порожня переоцінка або відсутність рекомендацій не означають, що неліквіду чи дефіциту немає: класифікація частини товарів недоступна.",
    "qualityLink": "Перевірити якість даних",
    "settingsLink": "Налаштувати власність і постачальників"
  },
  "en": {
    "missingStock": "SKUs without verified stock on the snapshot date. Historical records are retained separately; missing stock is not zero.",
    "missingReceipt": "SKUs without verified receipt history. Classification and STR are unavailable.",
    "missingVelocity": "SKUs without sufficient sales exposure history. WOH and reordering are unavailable.",
    "unknownOwnership": "merchandise SKUs without approved ownership. Margin and markdown eligibility require brand or product terms.",
    "unknownKind": "SKUs need product-type review.",
    "ariaLabel": "Report requirements",
    "heading": "What these reports still need",
    "scope": "For the entire source in this snapshot; display filters do not change these counts. Refreshing does not supply missing history or approvals.",
    "classificationWarning": "An empty markdown or recommendation list does not prove there is no dead stock or shortage: some products cannot yet be classified.",
    "qualityLink": "Review data quality",
    "settingsLink": "Configure ownership and suppliers"
  }
} satisfies Record<Lang, Record<string, string>>;
