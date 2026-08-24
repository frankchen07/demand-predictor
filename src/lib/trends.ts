import { fetchAllProductBreakdowns } from "./product-breakdown";
import { wasteRatePct } from "./demand-calc";

export interface OverallTrendPoint {
  bakeDate: string;
  wastePct: number | null;
  stockoutPct: number;
}

export async function fetchOverallTrend(businessId: string): Promise<OverallTrendPoint[]> {
  const breakdownsByDate = await fetchAllProductBreakdowns(businessId, { includeSynthetic: true });
  return breakdownsByDate.map(({ bakeDate, breakdown }) => ({
    bakeDate,
    wastePct: breakdown?.totalWastePct ?? null,
    stockoutPct: breakdown?.totalStockoutPct ?? 0,
  }));
}

export interface ProductTrendPoint {
  bakeDate: string;
  wastePct: number | null;
}

export interface ProductTrendSeries {
  productId: string;
  displayName: string;
  points: ProductTrendPoint[];
}

export async function fetchProductTrends(businessId: string): Promise<ProductTrendSeries[]> {
  const breakdownsByDate = await fetchAllProductBreakdowns(businessId, { includeSynthetic: true });
  const seriesByProduct = new Map<string, ProductTrendSeries>();

  for (const { bakeDate, breakdown } of breakdownsByDate) {
    if (!breakdown) continue;

    const rowsByProduct = new Map<string, typeof breakdown.rows>();
    for (const row of breakdown.rows) {
      const rows = rowsByProduct.get(row.productId) ?? [];
      rows.push(row);
      rowsByProduct.set(row.productId, rows);
    }

    for (const [productId, rows] of rowsByProduct) {
      const series = seriesByProduct.get(productId) ?? {
        productId,
        displayName: rows[0].displayName,
        points: [],
      };

      const metricsInputs = rows.map((row) => ({
        bakedQty: row.resolvedBakedQty,
        adjustmentQty: row.adjustmentQty,
        timeSoldOut: row.timeSoldOut,
        unsoldQty: row.unsoldQty,
      }));

      series.points.push({
        bakeDate,
        wastePct: wasteRatePct(metricsInputs),
      });
      seriesByProduct.set(productId, series);
    }
  }

  return [...seriesByProduct.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
