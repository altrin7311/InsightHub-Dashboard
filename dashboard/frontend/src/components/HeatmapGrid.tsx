import React from 'react';

type Cell = { label: string; value: number; demand?: number; supply?: number };
type Props = { cells: Cell[]; height?: number; highlight?: Set<string> | string[] };

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function colorFor(v: number) {
  // Diverging palette with higher contrast
  // 0% deep red -> 50% amber -> 100% green
  const t = Math.max(0, Math.min(1, v));
  let r: number, g: number, b: number;
  if (t <= 0.5) {
    const k = t / 0.5; // 0..1
    r = Math.round(lerp(239, 245, k));
    g = Math.round(lerp(68, 158, k));
    b = Math.round(lerp(68, 66, k));
  } else {
    const k = (t - 0.5) / 0.5; // 0..1
    r = Math.round(lerp(245, 34, k));
    g = Math.round(lerp(158, 197, k));
    b = Math.round(lerp(66, 94, k));
  }
  return `rgb(${r}, ${g}, ${b})`;
}

const HeatmapGrid: React.FC<Props> = ({ cells, height = 220, highlight }) => {
  const highlightSet = React.useMemo(() => {
    if (!highlight) return null;
    if (highlight instanceof Set) return highlight;
    return new Set(highlight);
  }, [highlight]);
  const max = Math.max(1, ...cells.map(c => Number.isFinite(c.value) ? c.value : 0));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8, maxHeight: height, overflow: 'auto' }}>
      {cells.map((c, i) => {
        const t = (c.value) / max;
        const pct = Math.min(100, Math.max(0, Math.round(t*100)));
        const widthPct = Math.max(5, pct); // ensure visibility even for 0%
        const isActive = highlightSet?.has(c.label) ?? false;
        return (
          <div
            key={i}
            title={`${c.label}: ${Math.round(c.value)}% • Demand ${Math.round(c.demand ?? 0)} • Supply ${Math.round(c.supply ?? 0)}`}
            style={{
              background: 'var(--surface-2)',
              border: isActive ? '1px solid #f97316' : '1px solid var(--border)',
              boxShadow: isActive ? '0 0 0 3px rgba(249,115,22,0.28)' : undefined,
              borderRadius: 10,
              padding: 8,
              transition: 'border-color .2s ease, box-shadow .2s ease',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
            <div style={{ height: 8, borderRadius: 999, background: '#111827', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${widthPct}%`, background: colorFor(t), transition: 'width .4s ease' }} />
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>{Math.round(c.value)}%</div>
          </div>
        );
      })}
    </div>
  );
};

export default HeatmapGrid;
