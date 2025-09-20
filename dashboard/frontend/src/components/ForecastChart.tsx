import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Label,
  Brush,
} from 'recharts';

type Props = {
  labels: string[];
  estimate: number[];
  demand: number[];
  supply: number[];
  band?: { lower: number[]; upper: number[] };
  height?: number;
  animate?: boolean;
  highlightGap?: 'demand-supply' | 'estimate-demand';
};

const ForecastChart: React.FC<Props> = ({ labels, estimate, demand, supply, band, height = 360, animate = true, highlightGap }) => {
  const [legendOpen, setLegendOpen] = React.useState(true);

  const data = labels.map((l, i) => ({
    name: l,
    estimate: estimate[i] ?? null,
    demand: demand[i] ?? null,
    supply: supply[i] ?? null,
    lower: band?.lower?.[i] ?? null,
    upper: band?.upper?.[i] ?? null,
    deviation: (() => {
      const est = estimate[i];
      const dem = demand[i];
      if (!Number.isFinite(est) || !Number.isFinite(dem) || !est) return null;
      return ((Number(dem) - Number(est)) / (Math.abs(Number(est)) || 1)) * 100;
    })(),
    gapPositive: (() => {
      if (!highlightGap) return null;
      const primary = highlightGap === 'demand-supply' ? demand[i] : estimate[i];
      const secondary = highlightGap === 'demand-supply' ? supply[i] : demand[i];
      if (!Number.isFinite(primary) || !Number.isFinite(secondary)) return null;
      const diff = Number(primary) - Number(secondary);
      return diff > 0 ? diff : null;
    })(),
    gapNegative: (() => {
      if (!highlightGap) return null;
      const primary = highlightGap === 'demand-supply' ? demand[i] : estimate[i];
      const secondary = highlightGap === 'demand-supply' ? supply[i] : demand[i];
      if (!Number.isFinite(primary) || !Number.isFinite(secondary)) return null;
      const diff = Number(primary) - Number(secondary);
      return diff < 0 ? diff : null;
    })(),
  }));

  const tickFmt = (t: any) => String(t).replace(/(20)(\d{2})/, '$2');
  const niceCeil = (max: number) => (max <= 50 ? Math.ceil(max/5)*5 : Math.ceil(max/10)*10);

  const isSame = (a: any[], b: any[]) => {
    let same = 0, total = 0;
    for (let i = 0; i < labels.length; i++) {
      const x = a[i]; const y = b[i];
      if (x == null || y == null) continue;
      total++;
      const diff = Math.abs(Number(x) - Number(y));
      const base = Math.max(1, Math.abs(Number(x)));
      if (diff / base < 0.005) same++; // within 0.5%
    }
    return total > 0 && same / total > 0.9;
  };
  const demandSameAsEstimate = isSame(demand, estimate);
  const supplySameAsEstimate = isSame(supply, estimate);

  return (
    <div className="forecast-chart-wrapper" style={{ width: '100%', height }}>
      <button className="legend-toggle" onClick={() => setLegendOpen((v) => !v)} aria-pressed={legendOpen}>
        {legendOpen ? 'Hide legend' : 'Show legend'}
      </button>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 16, bottom: 24, left: 46, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="name"
            interval={Math.ceil(labels.length / 10)}
            tickFormatter={tickFmt}
            tick={{ fill: 'var(--muted)' }}
            minTickGap={8}
            tickMargin={8}
            height={50}
            angle={labels.length > 8 ? -30 : 0}
            textAnchor={labels.length > 8 ? 'end' : 'middle'}
          >
            <Label value="Time (Quarter)" position="insideBottomRight" offset={-18} style={{ fill: 'var(--muted)' }} />
          </XAxis>
          <YAxis
            tick={{ fill: 'var(--muted)' }}
            width={46}
            allowDecimals={false}
            domain={[
              highlightGap ? ((min: number) => Math.min(0, Math.floor(min))) : 0,
              (max:number)=>niceCeil(max)
            ]}
          >
            <Label value="FTE Count" angle={-90} position="insideLeft" offset={10} style={{ fill: 'var(--muted)' }} />
          </YAxis>
          <Tooltip
            formatter={(value: any, name: any, props: any) => {
              if (name === 'gapPositive' || name === 'gapNegative') {
                const label = highlightGap === 'demand-supply' ? 'Demand − Supply gap' : 'Estimate − Demand gap';
                const val = Number(Math.abs(Number(value) || 0)).toFixed(2);
                const direction = name === 'gapPositive' ? 'shortfall' : 'surplus';
                return [`${val} FTE`, `${label} (${direction})`];
              }
              if (name === 'Estimate' || name === 'Demand') {
                const ctx = Array.isArray(value) ? Number(value[0]) : Number(value);
                const deviation = props?.payload?.deviation;
                const delta = Number.isFinite(deviation) ? ` • Δ ${deviation > 0 ? '+' : ''}${Number(deviation).toFixed(1)}%` : '';
                return [`${ctx.toFixed(2)} FTE`, `${name}${delta}`];
              }
              return [Number(value).toFixed(2) + ' FTE', name];
            }}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            labelFormatter={(lab) => lab}
          />
          {legendOpen && <Legend wrapperStyle={{ color: 'var(--muted)' }} />}

          {band && (
            <Area type="monotone" dataKey="upper" strokeWidth={0} fillOpacity={0} isAnimationActive={animate} />
          )}
          {band && (
            <Area
              dataKey="lower"
              strokeWidth={0}
              fill="rgba(34,197,94,0.15)"
              activeDot={false}
              isAnimationActive={animate}
            />
          )}

          {highlightGap && (
            <>
              <Area
                type="monotone"
                dataKey="gapPositive"
                name="Gap (shortfall)"
                fill="rgba(239,68,68,0.18)"
                stroke="rgba(239,68,68,0.45)"
                strokeWidth={0}
                isAnimationActive={animate}
                legendType="none"
              />
              <Area
                type="monotone"
                dataKey="gapNegative"
                name="Gap (surplus)"
                fill="rgba(34,197,94,0.18)"
                stroke="rgba(34,197,94,0.45)"
                strokeWidth={0}
                isAnimationActive={animate}
                legendType="none"
              />
            </>
          )}

          <Line type="monotone" dataKey="estimate" name="Estimate" stroke="#60a5fa" dot={false} strokeWidth={2.2} isAnimationActive={animate} />
          {!demandSameAsEstimate && (
            <Line type="monotone" dataKey="demand" name="Demand" stroke="#22c55e" dot={false} strokeWidth={2} isAnimationActive={animate} />
          )}
          {!supplySameAsEstimate && (
            <Line type="monotone" dataKey="supply" name="Supply" stroke="#f59e0b" dot={false} strokeWidth={2} isAnimationActive={animate} />
          )}
          <Brush dataKey="name" travellerWidth={10} height={24} stroke="var(--primary)" fill="rgba(15,22,32,0.85)" tickFormatter={tickFmt} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ForecastChart;
