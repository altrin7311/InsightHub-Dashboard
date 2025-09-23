import React from "react";

type Series = { name: string; color: string; data: number[] };

type Props = {
  labels: string[];
  series: Series[];
  height?: number;
  band?: { lower: number[]; upper: number[]; color?: string };
};

// Lightweight, dependency-free responsive line chart using Canvas.
const ChartLine: React.FC<Props> = ({ labels, series, height = 320, band }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * dpr;
    const h = canvas.clientHeight * dpr;
    canvas.width = width; canvas.height = h; ctx.scale(dpr, dpr);

    const W = canvas.clientWidth; const H = canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);

    const pad = { left: 46, right: 16, top: 16, bottom: 44 } as const;
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const all = series.flatMap(s => s.data);
    const min = Math.min(...all);
    const max = Math.max(...all);
    const range = max - min || 1;
    const yMin = min - range * 0.1;
    const yMax = max + range * 0.1;

    // Background grid
    const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#1f2937';
    ctx.strokeStyle = border;
    ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (plotH * i) / gridLines;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Axes labels (Y)
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#9ca3af';
    ctx.fillStyle = muted;
    ctx.font = '12px Inter, sans-serif';
    for (let i = 0; i <= gridLines; i++) {
      const v = yMin + (i * (yMax - yMin)) / gridLines;
      const y = pad.top + (plotH * i) / gridLines;
      ctx.fillText(formatValue(v), 4, y + 4);
    }

    // X labels (thin to avoid overlap)
    const stepX = plotW / Math.max(1, labels.length - 1);
    const maxTicks = 6;
    const tickStep = Math.max(1, Math.ceil(labels.length / maxTicks));
    for (let i = 0; i < labels.length; i += tickStep) {
      const x = pad.left + stepX * i;
      const lab = labels[i].replace(/(20)(\d{2})/, '$2');
      ctx.fillText(lab, x - 8, H - 6);
    }

    // Confidence band (optional)
    if (band && band.lower.length === labels.length && band.upper.length === labels.length) {
      const fill = band.color || 'rgba(99, 102, 241, 0.15)';
      ctx.fillStyle = fill;
      const toY = (v:number)=> pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
      // Upper path
      ctx.beginPath();
      for (let i=0;i<labels.length;i++) {
        const x = pad.left + (plotW * i) / Math.max(1, labels.length - 1);
        const y = toY(band.upper[i]);
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      // Lower path (reverse)
      for (let i=labels.length-1;i>=0;i--) {
        const x = pad.left + (plotW * i) / Math.max(1, labels.length - 1);
        const y = toY(band.lower[i]);
        ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Draw lines
    const toXY = (i: number, v: number) => {
      const x = pad.left + (plotW * i) / Math.max(1, labels.length - 1);
      const y = pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
      return { x, y };
    };

    series.forEach(s => {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2.2; ctx.beginPath();
      s.data.forEach((v, i) => { const { x, y } = toXY(i, v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.stroke();
      // Points
      s.data.forEach((v, i) => { const { x, y } = toXY(i, v); ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI*2); ctx.fill(); });
    });

  }, [labels, series]);

  React.useEffect(() => {
    draw();
  }, [draw]);

  React.useEffect(() => {
    const el = containerRef.current; if (!el) return;
    let ro: ResizeObserver | null = null;
    const onResize = () => draw();
    try {
      if (typeof (window as any).ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(onResize);
        ro.observe(el);
      } else {
        window.addEventListener('resize', onResize);
      }
    } catch {
      window.addEventListener('resize', onResize);
    }
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [draw]);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height }} />
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        {series.map(s => (
          <span key={s.name} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
};

function formatValue(v: number) {
  const a = Math.abs(v);
  if (a >= 1000) return (v/1000).toFixed(1) + 'k';
  return String(Math.round(v));
}

export default ChartLine;
