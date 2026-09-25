import type { CSSProperties } from "react";
import type { CalibrationStatus } from "@/lib/recommendation-engine";

export function soldOutBadgeClass(soldOut: boolean): string {
  return soldOut ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
}

export function calibrationBadgeClass(status: CalibrationStatus): string {
  switch (status) {
    case "on_target":
      return "bg-green-100 text-green-800";
    case "underbaking":
      return "bg-red-100 text-red-800";
    case "overbaking":
      return "bg-amber-100 text-amber-800";
    case "insufficient_data":
      return "bg-zinc-100 text-zinc-600";
  }
}

export function calibrationLabel(status: CalibrationStatus): string {
  switch (status) {
    case "on_target":
      return "On target";
    case "underbaking":
      return "Underbaking";
    case "overbaking":
      return "Overbaking";
    case "insufficient_data":
      return "Not enough data yet";
  }
}

// Green (0%) to red (100%) heat scale for waste %. Fixed high lightness keeps
// dark text readable across the whole range (worst-case contrast ~11:1 at 85% L).
export function wasteHeatStyle(pct: number | null): CSSProperties | undefined {
  if (pct == null) return undefined;
  const clamped = Math.max(0, Math.min(100, pct));
  const hue = 142 - (142 * clamped) / 100;
  return { backgroundColor: `hsl(${hue.toFixed(0)}, 70%, 85%)` };
}
