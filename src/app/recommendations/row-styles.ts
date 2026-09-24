import type { CSSProperties } from "react";

export function soldOutBadgeClass(soldOut: boolean): string {
  return soldOut ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
}

// Green (0%) to red (100%) heat scale for waste %. Fixed high lightness keeps
// dark text readable across the whole range (worst-case contrast ~11:1 at 85% L).
export function wasteHeatStyle(pct: number | null): CSSProperties | undefined {
  if (pct == null) return undefined;
  const clamped = Math.max(0, Math.min(100, pct));
  const hue = 142 - (142 * clamped) / 100;
  return { backgroundColor: `hsl(${hue.toFixed(0)}, 70%, 85%)` };
}
