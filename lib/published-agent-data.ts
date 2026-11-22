import "server-only";
import { createHash } from "node:crypto";
import { workspaceReportStorage } from "./workspace-report-storage";
import { readReportPublication } from "./merchandising-publication";

type DemoFixture = {
  products: Array<{
    pid: string;
    sku: string;
    brand: string;
    category: string;
    name: string;
    price: number;
    cost: number;
    stock: number;
    ownership: string;
  }>;
  events: Array<{
    pid: string;
    date: string;
    qty: number;
    unit: number;
    cost: number;
    status: number;
    channel: number;
  }>;
};

export async function readPublishedAgentData(
  tenantId: string,
  importRunId: string,
  from: Date,
  until?: Date,
) {
  const storage = await workspaceReportStorage(tenantId);
  if (!storage) return null;
  const active = await readReportPublication(tenantId, storage);
  if (active?.agentSource?.importRunId !== importRunId) return null;
  const tenantHash = createHash("sha256").update(tenantId).digest("hex");
  const file = await storage.read(`merchandising/v1/${tenantHash}/agent-input/${importRunId}.json`);
  if (!file) throw new Error("Published agent input is unavailable");
  const fixture = JSON.parse(file.text) as DemoFixture;
  const consignment = new Set(fixture.products.filter((product) => product.ownership === "CONSIGNMENT")
    .map((product) => product.pid));
  const products = fixture.products.map((product) => ({
    productId: product.pid,
    article: product.sku,
    vendorCode: null,
    name: product.name,
    category: product.category,
    brand: product.brand,
    retailPrice: product.price,
    costPrice: product.cost,
    stockUnits: product.stock,
  }));
  const sales = fixture.events.flatMap((event) => {
    const paymentDate = new Date(event.date);
    if (paymentDate < from || (until && paymentDate > until)) return [];
    const normalizedQuantity = event.qty * (event.status === 7 ? -1 : 1);
    return [{
      resolvedProductId: event.pid,
      paymentDate,
      normalizedQuantity,
      normalizedSales: event.unit * normalizedQuantity,
      normalizedCost: (consignment.has(event.pid) ? event.unit * 0.6 : event.cost) * normalizedQuantity,
      sourceValues: { sajt: event.channel },
    }];
  });
  return { products, sales };
}
