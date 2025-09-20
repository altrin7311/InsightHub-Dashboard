import React, { useRef } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import ChartActions from "./ChartActions";

type Segment = { name: string; value: number | string; color?: string };

type Props = {
  segments: Segment[];
  height?: number;
};

const PALETTE = [
  "#60a5fa",
  "#22c55e",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#93c5fd",
  "#eab308",
];

const DonutChart: React.FC<Props> = ({ segments, height = 240 }) => {
  const hostRef = useRef<HTMLDivElement>(null);

  const data = segments.map((s, i) => ({
    name: String(s.name),
    value: Number(s.value || 0),
    color: s.color || PALETTE[i % PALETTE.length],
  }));

  const total =
    data.reduce((acc, d) => acc + (Number.isFinite(d.value) ? d.value : 0), 0) || 1;

  return (
    <div
      className="chart-host"
      ref={hostRef}
      style={{ width: "100%", height }}
    >
      <ChartActions targetRef={hostRef} filename="area-share" csvRows={data} />

      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            stroke="#0b0f13"
            strokeWidth={1}
            isAnimationActive
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: any, _n: any, p: any) => [
              `${Number(v).toFixed(2)} (${Math.round(
                (Number(v) / total) * 100
              )}%)`,
              p?.payload?.name,
            ]}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          />
          <Legend wrapperStyle={{ color: "var(--muted)" }} layout="vertical" align="right" verticalAlign="middle" />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DonutChart;
