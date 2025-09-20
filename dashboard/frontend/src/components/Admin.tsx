import React from 'react';
import ForecastChart from './ForecastChart';

type TrainResult = {
  rows: { real: number; augmented: number };
  series: { labels: string[]; base: number[]; train_size: number; test_size: number };
  pred: { test_labels: string[]; test_actual: number[]; test_pred: number[] };
  metrics: { model: Record<string, number | null>; baseline: Record<string, number | null>; name?: string };
  forecast: { labels: string[]; values: number[] };
};

const Admin: React.FC = () => {
  const [augmented, setAugmented] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [res, setRes] = React.useState<TrainResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = async () => {
    setLoading(true); setError(null);
    const tryOnce = async (url: string) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ augmented, horizon: 8 }) });
      if (!r.ok) {
        let msg = '';
        try { msg = await r.text(); } catch {}
        throw new Error(msg || `HTTP ${r.status}`);
      }
      return r.json() as Promise<TrainResult>;
    };
    try {
      const base = (import.meta as any).env?.VITE_API_BASE ?? 'http://127.0.0.1:8000';
      let json: TrainResult | null = null;
      try { json = await tryOnce(base.replace(/\/$/, '') + '/train'); }
      catch (e1) {
        // Fallback to localhost in case backend bound there
        try { json = await tryOnce('http://localhost:8000/train'); }
        catch (e2) { throw e1; }
      }
      setRes(json!);
      window.dispatchEvent(new CustomEvent('model-trained', { detail: { tabs: ['summary', 'forecasting'] } }));
    } catch (e: any) {
      setError(e?.message || 'Failed to run training.');
    } finally { setLoading(false); }
  };

  const labels = React.useMemo(() => {
    if (!res) return [] as string[];
    return [...res.series.labels, ...res.forecast.labels];
  }, [res]);
  const est = React.useMemo(() => new Array(labels.length).fill(null as any), [labels]);
  const hist = React.useMemo(() => res ? res.series.base.concat(res.forecast.values) : [], [res]);

  return (
    <section className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Model Training</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="label">Dataset</span>
            <select className="input" value={augmented ? 'aug' : 'real'} onChange={(e)=> setAugmented(e.target.value === 'aug')}>
              <option value="real">Real only</option>
              <option value="aug">Real + Synthetic</option>
            </select>
            <button className="btn btn-primary" onClick={run} disabled={loading}>{loading ? 'Training…' : 'Run Training'}</button>
          </div>
        </div>
        <div className="card-body">
          {error && <div className="alert" style={{ marginBottom: 12 }}>{error}</div>}
          {!res ? (
            <div className="muted">Click Run Training to run Holt–Winters (additive) and forecast the next 8+ quarters.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="muted">Model: {res.metrics.name}</div>
              <div className="chips">
                <span className="chip">Rows (real): {res.rows.real}</span>
                <span className="chip">Rows (augmented): {res.rows.augmented}</span>
                <span className="chip">Train: {res.series.train_size}</span>
                <span className="chip">Test: {res.series.test_size}</span>
              </div>
              <div className="chips">
                <span className="chip">MAE: {res.metrics.model.mae?.toFixed(2)}</span>
                <span className="chip">RMSE: {res.metrics.model.rmse?.toFixed(2)}</span>
                <span className="chip">MAPE: {res.metrics.model.mape?.toFixed(2)}%</span>
                <span className="chip">R²: {res.metrics.model.r2?.toFixed(3)}</span>
              </div>
              <div className="chips">
                <span className="chip">Baseline RMSE: {res.metrics.baseline.rmse?.toFixed(2)}</span>
                <span className="chip">Baseline MAE: {res.metrics.baseline.mae?.toFixed(2)}</span>
              </div>
              <div className="card">
                <div className="card-header">Historical + Forecast (next 8 quarters)</div>
                <div className="card-body">
                  <ForecastChart labels={labels} estimate={est} demand={hist} supply={est} height={320} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Admin;
