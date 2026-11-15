export const brandMutationErrors: Record<string, string> = {
  BRAND_ALREADY_EXISTS: "Бренд із такою назвою вже існує. Змініть назву та спробуйте ще раз.",
  FORBIDDEN: "Недостатньо прав для цієї операції.",
  BRAND_HAS_ALIASES: "Спочатку видаліть прив’язані псевдоніми бренду, потім повторіть видалення.",
  VALIDATION_ERROR: "Перевірте введені дані та спробуйте ще раз.",
  NOT_FOUND: "Бренд не знайдено. Оновіть список брендів.",
};

export function brandMutationErrorMessage(code: string) {
  return Object.hasOwn(brandMutationErrors, code)
    ? brandMutationErrors[code]
    : "Не вдалося виконати операцію з брендом. Спробуйте ще раз.";
}
