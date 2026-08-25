"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type { OverallTrendPoint } from "@/lib/trends";

const TARGET_LABEL_COUNT = 10;

function OverallTrendTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as OverallTrendPoint | undefined;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-zinc-900">{label}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} style={{ color: entry.color }}>
          {entry.name}: {Number(entry.value).toFixed(1)}%
        </p>
      ))}
      {point?.topWasteProduct && (
        <p className="mt-1 text-zinc-500">
          Top waste: {point.topWasteProduct.displayName} ({point.topWasteProduct.unsoldQty} u)
        </p>
      )}
    </div>
  );
}

export function OverallTrendChart({ data }: { data: OverallTrendPoint[] }) {
  const minWidth = Math.max(640, data.length * 28);
  const tickInterval = Math.max(0, Math.ceil(data.length / TARGET_LABEL_COUNT) - 1);
  return (
    <div className="w-full overflow-x-auto">
      <div className="h-[26rem]" style={{ minWidth }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis
              dataKey="bakeDate"
              tick={{ fontSize: 13, fill: "#71717a" }}
              angle={-45}
              textAnchor="end"
              height={70}
              interval={tickInterval}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#71717a" }}
              unit="%"
              width={40}
              domain={[0, 100]}
              allowDataOverflow
            />
            <Tooltip content={OverallTrendTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="wastePct"
              name="Waste %"
              stroke="#dc2626"
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="stockoutPct"
              name="Sold Out %"
              stroke="#2563eb"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
