import type { ConnectorConnectionMessages } from "../use-connector-connection";
import type { Lang } from "@/lib/translations";

export const keyCrmConnectionMessages = {
  uk: {
    validationError: "Перевірте ID акаунту, ключ і підтвердження правил.",
    configChanged: "Підвищіть версію зміненого мапінгу та перевірте підключення знову.",
    failurePrefix: "Операцію не завершено. Повторіть спробу або перевірте доступи. Код: ",
    invalidResponse: "Відповідь сервера некоректна. Повторіть спробу.",
    saved: "Збережено. Перевірте доступи, потім явно виберіть KeyCRM як джерело звітів.",
    checked: "Перевірки читання завершені. Перегляньте кожен ресурс нижче.",
  },
  en: {
    validationError: "Check account ID, key and mapping confirmations.",
    configChanged: "Increase the revision of changed mappings and check again.",
    failurePrefix: "Operation failed. Retry or verify permissions. Code: ",
    invalidResponse: "The server response is invalid. Retry the operation.",
    saved: "Saved. Check read scopes, then explicitly select KeyCRM as the reporting source.",
    checked: "Read checks completed. Review each resource below.",
  },
} satisfies Record<Lang, ConnectorConnectionMessages>;
