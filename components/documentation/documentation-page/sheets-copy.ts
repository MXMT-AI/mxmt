import { documentationDocumentationPageSheetsCopyMessages as englishCopy, sheetsCopy as sheetsCopyEn } from "@/messages/en.json";
import { sheetsCopy as sheetsCopyUk } from "@/messages/uk.json";

export const demoSheetUrl = "https://docs.google.com/spreadsheets/d/19yKafilaFoTmn22bMIvUsYvxT65cLNPR3bKT3ri7OhY/edit";

export const sheetsColumns = {
  products: [
    [englishCopy.productsProductIdSkuName, englishCopy.productsBMC],
    [englishCopy.productsBrandCategoryBarcode, englishCopy.productsJIL],
    [englishCopy.productsRetailPriceCostPriceQuantity, englishCopy.productsDFG],
    [englishCopy.productsObservedAtInTransit, englishCopy.productsOP],
  ],
  orders: [
    [englishCopy.ordersOrderIdLineId, englishCopy.ordersAAE],
    [englishCopy.ordersProductIdSku, englishCopy.ordersXY],
    [englishCopy.ordersStatusIdChannelId, englishCopy.ordersFAG],
    [englishCopy.ordersOrderedAtPaidAtReturnedAt, englishCopy.ordersDGAF],
    [englishCopy.ordersQuantitySalesAmountCostAmount, englishCopy.ordersLABAC],
  ],
} as const;

export const sheetsCopy = { uk: sheetsCopyUk, en: sheetsCopyEn };
