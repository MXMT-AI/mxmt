export const policyFields = [
  {
    key: "salesAmount", uk: "Сума після знижок", en: "Amount after discounts",
    options: [
      { value: "net_line", uk: "За весь рядок", en: "Line total" },
      { value: "net_unit", uk: "За одиницю", en: "Per unit" },
    ],
  },
  {
    key: "costAmount", uk: "Собівартість у продажах", en: "Sales cost basis",
    options: [
      { value: "line", uk: "За весь рядок", en: "Line total" },
      { value: "unit", uk: "За одиницю", en: "Per unit" },
      { value: "unavailable", uk: "Не підтверджена", en: "Unverified" },
    ],
  },
  {
    key: "lineIdentity", uk: "Ідентичність рядка замовлення", en: "Order line identity",
    options: [
      { value: "column", uk: "Окрема колонка ID рядка", en: "Dedicated line-ID column" },
      { value: "order_product", uk: "Унікальна пара замовлення / товар", en: "Unique order / product pair" },
    ],
  },
  {
    key: "stockObservation", uk: "Час спостереження залишків", en: "Stock observation basis",
    options: [
      { value: "unverified", uk: "Не підтверджено", en: "Unverified" },
      { value: "column", uk: "З колонки часу", en: "Timestamp column" },
      { value: "import_observation", uk: "Поточне спостереження під час імпорту", en: "Current observation during import" },
    ],
  },
  {
    key: "defaultProductKind", uk: "Тип позицій за замовчуванням", en: "Default product kind",
    options: [
      { value: "UNKNOWN", uk: "Не підтверджено", en: "Unverified" },
      { value: "MERCHANDISE", uk: "Товар", en: "Merchandise" },
    ],
  },
] as const;
