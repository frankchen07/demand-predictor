"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { ProductTrendPoint, ProductTrendSeries } from "@/lib/trends";

const TARGET_LABEL_COUNT = 8;

function ProductTrendTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ProductTrendPoint | undefined;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-zinc-900">{label}</p>
      <p style={{ color: payload[0]?.color }}>Waste: {Number(payload[0]?.value).toFixed(1)}%</p>
      {point && (
        <>
          <p className="mt-1 text-zinc-500">Total baked: {point.totalBaked}</p>
          <p className="text-zinc-500">Total unbaked: {point.totalUnbaked}</p>
        </>
      )}
    </div>
  );
}

export function ProductTrendRow({ series }: { series: ProductTrendSeries }) {
  const minWidth = Math.max(480, series.points.length * 24);
  const tickInterval = Math.max(0, Math.ceil(series.points.length / TARGET_LABEL_COUNT) - 1);
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <h3 className="text-sm font-medium text-zinc-900">{series.displayName}</h3>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">Waste %</p>
      <div className="mt-2 w-full overflow-x-auto">
        <div className="h-64" style={{ minWidth }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series.points} margin={{ top: 4, right: 16, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis
                dataKey="bakeDate"
                tick={{ fontSize: 12, fill: "#a1a1aa" }}
                angle={-45}
                textAnchor="end"
                height={70}
                interval={tickInterval}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                unit="%"
                width={36}
                domain={[0, 100]}
                allowDataOverflow
              />
              <Tooltip content={ProductTrendTooltip} />
              <Line type="monotone" dataKey="wastePct" stroke="#dc2626" dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
