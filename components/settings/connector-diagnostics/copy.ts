import type { ResourceCheck } from "@/lib/connectors/contract";

type DiagnosticsCopy = {
  metadata: string;
  unsupported: string;
  incomplete: string;
  resources: Record<ResourceCheck["resource"], string>;
};

export const diagnosticsCopy = {
  uk: {
    metadata: "Магазин, версія API та дозволи",
    unsupported: "Не підтримується джерелом.",
    incomplete: "Довідник неповний. Повне читання виконується під час синхронізації.",
    resources: {
      identity: "Магазин і доступи", history: "Повнота історії", locations: "Локації",
      cost: "Доступ до вартості", orders: "Замовлення", statuses: "Статуси",
      channels: "Канали", catalog: "Каталог", products: "Товари", offers: "Варіанти",
      stock: "Залишки", receipts: "Приходи",
    },
  },
  en: {
    metadata: "Shop, API version and permissions",
    unsupported: "Unavailable from this source.",
    incomplete: "The dictionary is incomplete. Full reads run during synchronization.",
    resources: {
      identity: "Shop and permissions", history: "History coverage", locations: "Locations",
      cost: "Cost permission", orders: "Orders", statuses: "Statuses",
      channels: "Channels", catalog: "Catalog", products: "Products", offers: "Offers",
      stock: "Stock", receipts: "Receipts",
    },
  },
} satisfies Record<"uk" | "en", DiagnosticsCopy>;
