export interface Brand {
  id: string;
  name: string;
  budget: number;
  paymentDays: number;
  currency: string;
  country: string | null;
  contact: string | null;
  leadTimeDays: number;
  moq: number;
}

export interface CatalogUpload {
  id: string;
  brandId: string;
  season: string;
  itemCount: number;
  uploadedAt: string;
  brand: { name: string };
}

export interface CatalogItem {
  id: string;
  catalogId: string;
  brandId: string;
  sku: string;
  name: string;
  category: string;
  color: string | null;
  style: string | null;
  material: string | null;
  priceWholesale: number;
  priceRetail: number | null;
  minOrder: number;
  stockAvail: number;
  leadTimeDays: number;
  tags: string[];
  brand: { id: string; name: string; currency: string };
}

export interface CartItem {
  catalogItemId: string;
  sku: string;
  name: string;
  brandId: string;
  brandName: string;
  category: string;
  price: number;
  currency: string;
  qty: number;
  minOrder: number;
}

export type PlannerSection = "dashboard" | "catalog" | "duplicates" | "cart" | "ai" | "brands";

export interface AiMessage { role: "user" | "assistant"; content: string }


export type BrandBudgetStatus = Brand & { spent: number; remaining: number; pct: number };
