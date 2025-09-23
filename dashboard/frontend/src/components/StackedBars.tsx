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
  }, [labelsKey, labels.length, applyBrushRange]);

  const handleBrushChange = React.useCallback((range: any) => {
    if (!range) return;
    applyBrushRange(range.startIndex, range.endIndex);
  }, [applyBrushRange]);

  const handleWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!labels.length || !brushWindow) return;
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
  }, [labels.length, brushWindow, applyBrushRange]);
  const niceCeil = (max: number) => max <= 50 ? Math.ceil(max/5)*5 : Math.ceil(max/10)*10;
  const formatTick = (tick: string) => (tick.length > 9 ? `${tick.slice(0, 8)}…` : tick);
  return (
    <div className="chart-host" ref={hostRef as any} style={{ width: '100%', height, paddingTop: 4 }}>
      {showActions && <ChartActions targetRef={hostRef as any} filename="stacked-forecast-actual" csvRows={data} />}
      <div onWheel={handleWheel} style={{ width: '100%', height: '100%' }}>
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
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            minTickGap={12}
            tickMargin={14}
            interval={Math.max(1, Math.ceil((brushWindow ? (brushWindow.end - brushWindow.start + 1) : labels.length) / 8))}
            height={58}
            angle={45}
            textAnchor="end"
            tickFormatter={formatTick}
          >
            <Label value="Time (Quarter)" position="insideBottomRight" offset={-26} style={{ fill: 'var(--muted)' }} />
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
          <Brush
            dataKey="name"
            travellerWidth={14}
            height={32}
            stroke="var(--primary)"
            fill="rgba(56,189,248,0.12)"
            startIndex={brushWindow?.start}
            endIndex={brushWindow?.end}
            onChange={handleBrushChange}
          />
        </BarChart>
      </ResponsiveContainer>
      </div>
      {brushHint && <div className="brush-hint">{brushHint}</div>}
    </div>
  );
};

export default StackedBars;
