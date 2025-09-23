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
  useBrush?: boolean;
};

const ForecastChart: React.FC<Props> = ({ labels, estimate, demand, supply, band, height = 360, animate = true, highlightGap, useBrush = true }) => {
  const [legendOpen, setLegendOpen] = React.useState(true);
  const labelsKey = React.useMemo(() => labels.join('|'), [labels]);
  const [brushWindow, setBrushWindow] = React.useState<{ start: number; end: number } | null>(null);
  const [brushHint, setBrushHint] = React.useState<string | null>(null);

  const clampRange = React.useCallback((startRaw: number | undefined, endRaw: number | undefined) => {
    const size = labels.length;
    if (size <= 0) return null;
    const start = Math.max(0, Math.min(typeof startRaw === 'number' ? startRaw : 0, size - 1));
    const end = Math.max(start, Math.min(typeof endRaw === 'number' ? endRaw : start, size - 1));
    return { start, end };
  }, [labels.length]);

  const applyBrushRange = React.useCallback((startRaw?: number, endRaw?: number) => {
    const range = clampRange(startRaw, endRaw);
    if (!range) {
      setBrushWindow(null);
      setBrushHint(null);
      return;
    }
    setBrushWindow((prev) => {
      if (prev && prev.start === range.start && prev.end === range.end) return prev;
      return range;
    });
    const startLabel = labels[range.start] ?? '';
    const endLabel = labels[range.end] ?? startLabel;
    setBrushHint(startLabel && endLabel ? `${startLabel} → ${endLabel}` : startLabel || null);
  }, [clampRange, labels]);

  React.useEffect(() => {
    if (!useBrush) {
      setBrushWindow(null);
      setBrushHint(null);
      return;
    }
    if (!labels.length) {
      setBrushWindow(null);
      setBrushHint(null);
      return;
    }
    const size = labels.length;
    if (size === 1) {
      applyBrushRange(0, 0);
      return;
    }
    const defaultSpan = Math.max(1, Math.min(size - 1, Math.round(size * 0.6)));
    const end = size - 1;
    const start = Math.max(0, end - defaultSpan);
    applyBrushRange(start, end);
  }, [labelsKey, labels.length, applyBrushRange, useBrush]);

  const handleBrushChange = React.useCallback((range: any) => {
    if (!useBrush || !range) return;
    applyBrushRange(range.startIndex, range.endIndex);
  }, [applyBrushRange, useBrush]);

  const handleWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!useBrush || !labels.length || !brushWindow) return;
    const size = labels.length;
    if (size <= 1) return;
    const deltaSource = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!deltaSource) return;
    const deltaSign = deltaSource > 0 ? 1 : -1;
    const span = Math.max(1, brushWindow.end - brushWindow.start);
    if (span >= size) return;
    const shift = deltaSign * Math.max(1, Math.floor(span / 4));
    let start = brushWindow.start + shift;
    const maxStart = Math.max(0, size - span - 1);
    start = Math.max(0, Math.min(start, maxStart));
    const end = Math.min(size - 1, start + span);
    applyBrushRange(start, end);
    event.preventDefault();
  }, [labels.length, brushWindow, applyBrushRange, useBrush]);

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
      <div onWheel={handleWheel} style={{ width: '100%', height: '100%' }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 16, bottom: 28, left: 46, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="name"
            interval={Math.max(1, Math.ceil((brushWindow ? (brushWindow.end - brushWindow.start + 1) : labels.length) / 8))}
            tickFormatter={tickFmt}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            minTickGap={12}
            tickMargin={14}
            height={58}
            angle={45}
            textAnchor="end"
          >
            <Label value="Time (Quarter)" position="insideBottomRight" offset={-26} style={{ fill: 'var(--muted)' }} />
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
            <Label value="FTE Count" angle={-90} position="insideLeft" offset={12} style={{ fill: 'var(--muted)' }} />
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
          {useBrush && (
            <Brush
              dataKey="name"
              travellerWidth={14}
              height={32}
              stroke="var(--primary)"
              fill="rgba(56,189,248,0.12)"
              tickFormatter={tickFmt}
              startIndex={brushWindow?.start}
              endIndex={brushWindow?.end}
              onChange={handleBrushChange}
            />
          )}
        </ComposedChart>
        </ResponsiveContainer>
      </div>
      {useBrush && brushHint && <div className="brush-hint">{brushHint}</div>}
    </div>
  );
};

export default ForecastChart;
