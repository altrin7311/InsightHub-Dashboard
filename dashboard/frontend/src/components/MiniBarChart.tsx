import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Label } from 'recharts';
import ChartActions from './ChartActions';

export type BarItem = { name: string; value: number };

type Props = {
  items: BarItem[];
  height?: number;
  color?: string;
  onSelect?: (item: BarItem) => void;
};

const MiniBarChart: React.FC<Props> = ({ items, height = 220, color = '#60a5fa', onSelect }) => {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const data = items.map(i => ({ name: i.name, value: i.value }));
  const niceCeil = (max: number) => {
    if (!Number.isFinite(max)) return 10;
    return max <= 50 ? Math.ceil(max / 5) * 5 : Math.ceil(max / 10) * 10;
  };
  const handleClick = React.useCallback((_entry: any, index: number) => {
    if (!onSelect) return;
    const item = items[index];
    if (item) onSelect(item);
  }, [onSelect, items]);
  return (
    <div className="chart-host" ref={hostRef as any} style={{ width: '100%', height, paddingTop: 4 }}>
      <ChartActions targetRef={hostRef as any} filename="top-gaps" csvRows={data} />
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 20, bottom: 30, left: 46 }} barCategoryGap={"18%"}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="name"
            tick={{ fill: 'var(--muted)' }}
            minTickGap={6}
            tickMargin={8}
            interval={data.length > 10 ? Math.ceil(data.length / 10) : 0}
            height={50}
            angle={data.length > 8 ? -30 : 0}
            textAnchor={data.length > 8 ? 'end' : 'middle'}
          >
            <Label value="Projects" position="insideBottomRight" offset={-18} style={{ fill: 'var(--muted)' }} />
          </XAxis>
          <YAxis
            tick={{ fill: 'var(--muted)' }}
            width={46}
            allowDecimals={false}
            domain={[0, (max: number) => niceCeil(max)]}
          >
            <Label value="Gap Value" angle={-90} position="insideLeft" offset={10} style={{ fill: 'var(--muted)' }} />
          </YAxis>
          <Tooltip formatter={(v: any) => [Number(v).toFixed(2), 'gap']} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
          <Bar
            dataKey="value"
            fill={color}
            stroke="#0b0f13"
            strokeOpacity={0.35}
            radius={[8, 8, 0, 0]}
            isAnimationActive
            animationDuration={700}
            animationEasing="ease-out"
            onClick={handleClick as any}
            cursor={onSelect ? 'pointer' : 'default'}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MiniBarChart;
