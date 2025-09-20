import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Label, LabelList, Brush } from 'recharts';
import ChartActions from './ChartActions';

type Props = {
  labels: string[];
  a: number[]; // Actual/Estimate
  b: number[]; // Forecast
  names?: { a?: string; b?: string };
  height?: number;
  showActions?: boolean;
};

const StackedBars: React.FC<Props> = ({ labels, a, b, names = { a: 'Actual', b: 'Forecast' }, height = 240, showActions = true }) => {
  const data = labels.map((l, i) => {
    const actual = a[i] ?? 0;
    const forecast = b[i] ?? 0;
    const gap = actual ? ((forecast - actual) / Math.abs(actual)) * 100 : 0;
    return { name: l, a: actual, b: forecast, gap };
  });
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const niceCeil = (max: number) => max <= 50 ? Math.ceil(max/5)*5 : Math.ceil(max/10)*10;
  const formatTick = (tick: string) => (tick.length > 9 ? `${tick.slice(0, 8)}…` : tick);
  return (
    <div className="chart-host" ref={hostRef as any} style={{ width: '100%', height, paddingTop: 4 }}>
      {showActions && <ChartActions targetRef={hostRef as any} filename="stacked-forecast-actual" csvRows={data} />}
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 20, left: 46, bottom: 34 }} barCategoryGap={'18%'}>
          <defs>
            <linearGradient id="gradA" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id="gradB" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.75" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="name"
            tick={{ fill: 'var(--muted)' }}
            minTickGap={8}
            tickMargin={8}
            interval={Math.ceil(labels.length / 10)}
            height={50}
            angle={labels.length > 8 ? -30 : 0}
            textAnchor={labels.length > 8 ? 'end' : 'middle'}
            tickFormatter={formatTick}
          >
            <Label value="Time (Quarter)" position="insideBottomRight" offset={-18} style={{ fill: 'var(--muted)' }} />
          </XAxis>
          <YAxis tick={{ fill: 'var(--muted)' }} width={46} allowDecimals={false} domain={[0, (max:number)=>niceCeil(max)]}>
            <Label value="FTE Count" angle={-90} position="insideLeft" offset={10} style={{ fill: 'var(--muted)' }} />
          </YAxis>
          <Tooltip formatter={(v: any, n: any) => [Number(v).toFixed(2) + ' FTE', n]} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
          <Legend wrapperStyle={{ color: 'var(--muted)' }} />
          <Bar dataKey="a" name={names.a} stackId="s" fill="url(#gradA)" stroke="#0b0f13" strokeOpacity={0.35} radius={[6,6,0,0]} isAnimationActive animationDuration={600} animationEasing="ease-out">
            <LabelList dataKey="a" position="top" formatter={(v: any) => Number(v).toFixed(0)} fill="var(--muted)" />
          </Bar>
          <Bar dataKey="b" name={names.b} stackId="s" fill="url(#gradB)" stroke="#0b0f13" strokeOpacity={0.35} radius={[6,6,0,0]} isAnimationActive animationDuration={600} animationEasing="ease-out">
            <LabelList
              dataKey="b"
              position="top"
              formatter={(_v: any, _name: any, props: any) => {
                const gap = props?.payload?.gap;
                return Number.isFinite(gap) ? `${gap >= 0 ? '+' : ''}${Number(gap).toFixed(1)}%` : '';
              }}
              fill="var(--muted)"
            />
          </Bar>
          <Brush dataKey="name" travellerWidth={10} height={24} stroke="var(--primary)" fill="rgba(15,22,32,0.85)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StackedBars;
