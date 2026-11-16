import type { ConnectorConnectionMessages } from "../use-connector-connection";
import type { Lang } from "@/lib/translations";

export const salesDriveConnectionMessages = {
  uk: {
    storageUnavailable: "Захищене зберігання недоступне. Зверніться до адміністратора.",
    validationError: "Перевірте домен SalesDrive, ключ читання замовлень і YML-посилання цього акаунту.",
    failure: "Не вдалося виконати запит. Спробуйте ще раз.",
    configChanged: "Не вдалося виконати запит. Спробуйте ще раз.",
    networkError: "Помилка мережі. Спробуйте ще раз.",
    saved: "З’єднання збережено. Тепер перевірте доступ.",
    checked: "Перевірку завершено. Результати наведені нижче.",
  },
  en: {
    storageUnavailable: "Secure storage is unavailable. Contact your administrator.",
    validationError: "Check the SalesDrive hostname, orders read key and YML link for this account.",
    failure: "The request failed. Try again.",
    configChanged: "The request failed. Try again.",
    networkError: "Network error. Try again.",
    saved: "Connection saved. Check access next.",
    checked: "Check complete. Review the results below.",
  },
} satisfies Record<Lang, ConnectorConnectionMessages>;
