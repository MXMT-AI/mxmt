const reasons: Record<string, [string, string]> = {
  IMPORT_QUARANTINED: [
    "В імпорті є ізольовані замовлення: перевірте якість даних",
    "Import contains quarantined orders: review data quality",
  ],
  INSUFFICIENT_HISTORY: ["Недостатньо історії", "Insufficient history"],
  MISSING_REVENUE: ["Неповна виручка", "Incomplete revenue"],
  LY_NON_POSITIVE: ["LY не додатний", "LY is not positive"],
  NORMALIZATION_REPLAY_REQUIRED: [
    "Потрібен повторний імпорт історії",
    "History replay required",
  ],
  PROJECT_MAPPING_UNVERIFIED: [
    "Не підтверджено поле проєкту",
    "Project field unverified",
  ],
  RETURN_DATE_UNAVAILABLE: [
    "Невідома дата повернення",
    "Return date unavailable",
  ],
  PAYMENT_DATE_UNAVAILABLE: [
    "Невідома дата оплати",
    "Payment date unavailable",
  ],
  INFERRED_PAYMENT_DATE: [
    "Використано погоджену резервну дату",
    "Approved inferred sale date",
  ],
  PRODUCT_KIND_UNVERIFIED: [
    "Не підтверджено тип товару",
    "Product type unverified",
  ],
  CURRENCY_UNVERIFIED: ["Невідома валюта", "Currency unverified"],
  REVENUE_UNAVAILABLE: ["Невідомий дохід рядка", "Line revenue unavailable"],
  SERVICE_PROFIT_UNVERIFIED: [
    "Не погоджено прибуток послуг",
    "Service profit treatment unverified",
  ],
  OWNERSHIP_UNVERIFIED: ["Невідома власність", "Ownership unverified"],
  PREORDER_AMOUNT_UNAVAILABLE: [
    "Невідома сума передзамовлення",
    "Preorder amount unavailable",
  ],
  MISSING_COST: ["Невідома собівартість", "Cost unavailable"],
  COMMISSION_UNVERIFIED: ["Невідома комісія", "Commission unavailable"],
};

export function salesReportReason(code: string, uk: boolean): string {
  return reasons[code]?.[uk ? 0 : 1] ?? code;
}
