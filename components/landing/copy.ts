import type { Locale } from "@/i18n/routing";

type Feature = { title: string; description: string };

export const landingCopy = {
  uk: {
    skip: "Перейти до основного вмісту",
    announcement: "Підключіть дані свого магазину до MXMT",
    navigation: "Головна навігація",
    menu: "Меню",
    product: "Можливості",
    workflow: "Як це працює",
    integrations: "Інтеграції",
    documentation: "Документація",
    login: "Увійти",
    register: "Створити кабінет",
    language: "English",
    audience: "Аналітика для fashion-ритейлу",
    headline: ["Продажі. Залишки.", "Рішення для асортименту."],
    description: "Зрозумійте, що продається, де бракує товару і що варто переоцінити. Усі дані для рішення — в одному кабінеті.",
    explore: "Оглянути можливості",
    productHeading: "Від огляду бізнесу до дії по SKU",
    features: {
      overview: { title: "Огляд", description: "Перевіряйте виручку, стан запасів і пріоритетні дії за вибраний період." },
      sales: { title: "Продажі", description: "Порівнюйте виручку та обсяги продажів за каналами, категоріями й товарами." },
      stock: { title: "Склад", description: "Оцінюйте структуру залишків і знаходьте товари з ризиком дефіциту або надлишку." },
      repricing: { title: "Переоцінка", description: "Моделюйте нові ціни та перевіряйте вплив знижок перед експортом сценарію." },
      reordering: { title: "Дозамовлення", description: "Переглядайте рекомендації щодо поповнення та готуйте сценарій закупівлі." },
    },
    workflowHeading: "Від джерела даних до рішення",
    steps: [
      { title: "Підключіть джерело", description: "Імпортуйте каталог, продажі й залишки з вашої системи або файлу." },
      { title: "Перевірте показники", description: "Зіставте поля, виберіть період і перевірте повноту даних у звітах." },
      { title: "Підготуйте дію", description: "Оберіть SKU, перегляньте сценарій переоцінки або дозамовлення й експортуйте його." },
    ],
    integrationsHeading: "Працюйте з даними, які вже маєте",
    integrationsDescription: "Виберіть джерело для звітів і налаштуйте імпорт у своєму кабінеті.",
    closing: "Почніть з даних свого магазину",
  },
  en: {
    skip: "Skip to main content",
    announcement: "Connect your store data to MXMT",
    navigation: "Main navigation",
    menu: "Menu",
    product: "Product",
    workflow: "How it works",
    integrations: "Integrations",
    documentation: "Documentation",
    login: "Log in",
    register: "Create a workspace",
    language: "Українська",
    audience: "Analytics for fashion retail",
    headline: ["Sales. Stock.", "Better assortment decisions."],
    description: "See what sells, where stock is running low and which products to reprice. Get the data behind each decision in one workspace.",
    explore: "Explore the product",
    productHeading: "From business overview to action by SKU",
    features: {
      overview: { title: "Overview", description: "Review revenue, inventory health and priority actions for your selected period." },
      sales: { title: "Sales", description: "Compare revenue and units sold across channels, categories and products." },
      stock: { title: "Inventory", description: "Review your stock mix and spot products at risk of shortages or excess stock." },
      repricing: { title: "Repricing", description: "Model new prices and review the impact of discounts before exporting a scenario." },
      reordering: { title: "Reordering", description: "Review replenishment recommendations and prepare a purchasing scenario." },
    },
    workflowHeading: "From source data to a decision",
    steps: [
      { title: "Connect your source", description: "Import catalogue, sales and stock data from your system or a file." },
      { title: "Review your metrics", description: "Map the fields, choose a period and check data coverage in your reports." },
      { title: "Prepare an action", description: "Choose the SKUs, review your repricing or reordering scenario and export it." },
    ],
    integrationsHeading: "Work with the data you already have",
    integrationsDescription: "Choose a reporting source and set up the import in your workspace.",
    closing: "Start with your store data",
  },
} satisfies Record<Locale, {
  skip: string;
  announcement: string;
  navigation: string;
  menu: string;
  product: string;
  workflow: string;
  integrations: string;
  documentation: string;
  login: string;
  register: string;
  language: string;
  audience: string;
  headline: [string, string];
  description: string;
  explore: string;
  productHeading: string;
  features: Record<"overview" | "sales" | "stock" | "repricing" | "reordering", Feature>;
  workflowHeading: string;
  steps: Feature[];
  integrationsHeading: string;
  integrationsDescription: string;
  closing: string;
}>;

export const landingFeatures = ["overview", "sales", "stock", "repricing", "reordering"] as const;
