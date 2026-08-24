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
import type { OverallTrendPoint } from "@/lib/trends";

const TARGET_LABEL_COUNT = 10;

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
            <YAxis tick={{ fontSize: 11, fill: "#71717a" }} unit="%" width={40} />
            <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
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
