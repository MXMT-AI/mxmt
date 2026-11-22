import { salesReportLabelsMessages as ukrainianCopy } from "@/messages/uk.json";

export const ukSalesColumns: Record<string, string> = {
  name: ukrainianCopy.nameНазва,
  revenueDelta: ukrainianCopy.revenueDeltaЗмінаВиручки,
  unitsDelta: ukrainianCopy.unitsDeltaЗмінаОдиниць,
  lyCoveredGrossProfit: ukrainianCopy.lyCoveredGrossProfitПокритийВаловийПрибутокLY,
  lyGmPct: ukrainianCopy.lyGmPctПокритаМаржаLY,
  currency: ukrainianCopy.currencyВалюта,
  revenue: ukrainianCopy.revenueЧистаВиручка,
  units: ukrainianCopy.unitsОдиниціТовару,
  orderCount: ukrainianCopy.orderCountЗамовленняПродажі,
  returnOrderCount: ukrainianCopy.returnOrderCountЗамовленняПовернення,
  coveredGrossProfit: ukrainianCopy.coveredGrossProfitВаловийПрибутокПокритихРядків,
  coveredRevenue: ukrainianCopy.coveredRevenueВиручкаПокритихРядків,
  gmPct: ukrainianCopy.gmPctМаржаПокритихРядків,
  lyRevenue: ukrainianCopy.lyRevenueВиручкаLYЗаТіСамі,
  revenueChangePct: ukrainianCopy.revenueChangePctВиручкаПротиLY,
  missingProfitCount: ukrainianCopy.missingProfitCountРядкиБезПрибутку,
  coverage: ukrainianCopy.coverageПокриттяПрибутку,
  comparisonReason: ukrainianCopy.comparisonReasonДоступністьLY,
};
