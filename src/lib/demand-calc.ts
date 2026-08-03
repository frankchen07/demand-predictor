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
