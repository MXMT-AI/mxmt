export type Model = "SEASONAL" | "CARRYOVER" | "HYBRID" | "";

export interface Answers {
  storeType: string;
  categories: string[];
  channels: string[];
  city: string;
  seasonsPerYear: string;
  ssArrival: string;
  saleStart: string;
  hitReorder: string;
  batchesPerSeason: string;
  replenishmentModel: string;
  leadTimeType: string;
  eolRisk: string;
  minMargin: string;
  currencyRisk: string;
  logisticsRestrictions: string;
}
