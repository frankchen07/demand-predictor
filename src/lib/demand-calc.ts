export interface DemandInput {
  bakedQty: number | null;
  adjustmentQty: number | null;
  timeSoldOut: string | null;
  unsoldQty: number | null;
}

/**
 * Censored-demand rule: if the item sold out before close, true demand exceeded
 * what was baked (unknown by how much), so we scale up by stockoutAdjustmentFactor
 * rather than undercounting via baked - unsold. Returns null when baked_qty itself
 * wasn't recorded (item not offered that day) — there's no demand signal to use.
 */
export function estimateDemand(
  input: DemandInput,
  stockoutAdjustmentFactor: number,
): number | null {
  if (input.bakedQty == null) return null;

  let estimated: number;
  if (input.timeSoldOut != null) {
    estimated = input.bakedQty * (1 + stockoutAdjustmentFactor);
  } else if (input.unsoldQty != null) {
    // unsold can exceed baked when leftovers get logged against a 0-baked topup
    // row instead of the batch that actually produced them — demand is never negative
    estimated = Math.max(0, input.bakedQty - input.unsoldQty);
  } else {
    estimated = input.bakedQty;
  }

  return Math.max(0, estimated + (input.adjustmentQty ?? 0));
}

export function didStockOut(input: DemandInput): boolean {
  return input.timeSoldOut != null;
}

export function stockoutRate(inputs: DemandInput[]): number {
  const withBaked = inputs.filter((i) => i.bakedQty != null);
  if (withBaked.length === 0) return 0;
  return withBaked.filter(didStockOut).length / withBaked.length;
}

export function wasteRatePct(inputs: DemandInput[]): number | null {
  const totalBaked = inputs.reduce((sum, i) => sum + (i.bakedQty ?? 0), 0);
  if (totalBaked === 0) return null;
  const totalUnsold = inputs.reduce((sum, i) => sum + (i.unsoldQty ?? 0), 0);
  return (totalUnsold / totalBaked) * 100;
}

/**
 * Nonparametric quantile (linear interpolation between ranks) over an ascending-sorted
 * array. Used for the newsvendor buffer: with only a handful of historical demand
 * samples per item, an empirical quantile on the actual swings is more honest than
 * assuming a normal distribution.
 */
export function quantile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = p * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export const STORE_OPEN_TIME = "07:00:00";
export const STORE_CLOSE_TIME = "14:00:00";

export function timeToHours(time: string): number {
  const [h, m, s] = time.split(":").map(Number);
  return h + m / 60 + (s ?? 0) / 3600;
}

const FALLBACK_WINDOW_HOURS = timeToHours(STORE_CLOSE_TIME) - timeToHours(STORE_OPEN_TIME);

export interface SellRateInput {
  resolvedBakedQty: number | null;
  unsoldQty: number | null;
  hoursToSellOut: number | null;
  soldOut: boolean;
}

/**
 * When an item didn't sell out, there's no recorded sellout time to measure against —
 * fall back to the store's open-to-close window (7am-2pm) as the denominator, and use
 * qty actually sold (baked - unsold) rather than full baked qty, since only part of it moved.
 */
export function sellRatePerHour(input: SellRateInput): number | null {
  if (input.resolvedBakedQty == null) return null;
  if (input.soldOut) {
    return input.hoursToSellOut != null && input.hoursToSellOut > 0
      ? input.resolvedBakedQty / input.hoursToSellOut
      : null;
  }
  const sold = Math.max(0, input.resolvedBakedQty - (input.unsoldQty ?? 0));
  return sold / FALLBACK_WINDOW_HOURS;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export interface TimingInput {
  groupKey: string; // rows sharing a key are ordered against each other by batchSequence
  batchSequence: number;
  isFirstBake: boolean; // true iff batchSequence equals the business's global minimum sequence
  timeSoldOut: string | null;
}

/**
 * The first bake of the day (isFirstBake) is measured from store open. Any later bake is
 * measured from the nearest earlier-sequence row *actually present* in this group — not
 * "whatever's first in today's data for this product," which would misattribute a
 * topup-with-no-AM-row day to store open instead of showing it's unknown.
 */
export function withHoursToSellOut<T extends TimingInput>(
  items: T[],
): (T & { hoursToSellOut: number | null })[] {
  const byGroup = new Map<string, T[]>();
  for (const item of items) {
    const group = byGroup.get(item.groupKey) ?? [];
    group.push(item);
    byGroup.set(item.groupKey, group);
  }

  const hoursByItem = new Map<T, number | null>();
  for (const group of byGroup.values()) {
    const sorted = [...group].sort((a, b) => a.batchSequence - b.batchSequence);
    sorted.forEach((item, i) => {
      const previous = i === 0 ? null : sorted[i - 1];
      const baseline = item.isFirstBake ? STORE_OPEN_TIME : (previous?.timeSoldOut ?? null);
      hoursByItem.set(
        item,
        item.timeSoldOut != null && baseline != null
          ? timeToHours(item.timeSoldOut) - timeToHours(baseline)
          : null,
      );
    });
  }

  return items.map((item) => ({ ...item, hoursToSellOut: hoursByItem.get(item) ?? null }));
}
