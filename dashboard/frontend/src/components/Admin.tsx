import React from 'react';
import ForecastChart from './ForecastChart';
import type { UploadResponse, TrainingRecord, TrainingRunResult } from '../types';

type DatasetKey = 'real' | 'augmented';

type Props = {
  data: UploadResponse;
  onRefreshTraining?: () => Promise<void> | void;
};

const Admin: React.FC<Props> = ({ data, onRefreshTraining }) => {
  const training = data.training ?? {};
  const [dataset, setDataset] = React.useState<DatasetKey>(() => {
    if (training.real?.status === 'ok') return 'real';
    if (training.augmented?.status === 'ok') return 'augmented';
    return 'real';
  });
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (dataset === 'real' && !training.real && training.augmented) {
      setDataset('augmented');
    }
  }, [dataset, training.real, training.augmented]);

  const activeRecord: TrainingRecord | null | undefined = dataset === 'real' ? training.real : training.augmented;
  const counterpart: TrainingRecord | null | undefined = dataset === 'real' ? training.augmented : training.real;
  const status = activeRecord?.status;
  const result: TrainingRunResult | null | undefined = activeRecord?.result ?? null;

  const labels = React.useMemo(() => {
    if (!result) return [] as string[];
    return [...result.series.labels, ...result.forecast.labels];
  }, [result]);
  const seriesValues = React.useMemo(() => {
    if (!result) return [] as number[];
    return [...result.series.base, ...result.forecast.values];
  }, [result]);
  const estimateStub = React.useMemo(() => new Array(labels.length).fill(null as any), [labels.length]);

  const testRows = React.useMemo(() => {
    if (!result) return [] as Array<{ label: string; actual: number | null; predicted: number | null; error: number | null }>;
    return result.pred.test_labels.map((label, idx) => {
      const actual = result.pred.test_actual[idx] ?? null;
      const predicted = result.pred.test_pred[idx] ?? null;
      const error = typeof actual === 'number' && typeof predicted === 'number' ? predicted - actual : null;
      return { label, actual, predicted, error };
    });
  }, [result]);

  const improvement = React.useMemo(() => {
    if (!result) return null;
    const model = result.metrics.model;
    const baseline = result.metrics.baseline;
    if (typeof model.rmse === 'number' && typeof baseline.rmse === 'number') {
      return baseline.rmse - model.rmse;
    }
    return null;
  }, [result]);

  const lastRun = activeRecord?.timestamp ? new Date(activeRecord.timestamp) : null;
  const lastRunLabel = lastRun ? lastRun.toLocaleString() : 'n/a';

  const handleRefresh = async () => {
    if (!onRefreshTraining) return;
    setRefreshing(true);
    try {
      await onRefreshTraining();
    } catch (err) {
      console.error('Refresh training failed', err);
    } finally {
      setRefreshing(false);
    }
  };

  const datasetMeta = dataset === 'real'
    ? {
        title: 'Real data only',
        note: `${data.row_count ?? 0} rows used for training` + (result ? ` • train ${result.series.train_size}, test ${result.series.test_size}` : ''),
      }
    : {
        title: 'Real + Synthetic data',
        note: `${data.aug_row_count ?? data.row_count ?? 0} rows used for training` + (result ? ` • train ${result.series.train_size}, test ${result.series.test_size}` : ''),
      };

  return (
    <section className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Model Performance</div>
            <div className="muted" style={{ fontSize: 12 }}>Evaluation for automatically trained Holt–Winters models.</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className={`btn ${dataset === 'real' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setDataset('real')}>
              Real data
            </button>
            <button className={`btn ${dataset === 'augmented' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setDataset('augmented')}>
              Real + Synthetic
            </button>
            {onRefreshTraining && (
              <button className="btn btn-ghost" onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? 'Refreshing…' : 'Refresh results'}
              </button>
            )}
          </div>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 600 }}>{datasetMeta.title}</span>
            <span className="muted">{datasetMeta.note}</span>
            <span className="muted">Status: {status ?? 'no run yet'} • Last run: {lastRunLabel}</span>
          </div>

          {status === 'error' && (
            <div className="alert">{activeRecord?.error || 'Training failed. Try refreshing once data covers at least 8 quarters.'}</div>
          )}

          {status === 'running' && (
            <div className="muted">Training in progress… this view will update automatically.</div>
          )}

          {result ? (
            <>
              <div className="chips">
                <span className="chip">Train quarters: {result.series.train_size}</span>
                <span className="chip">Test quarters: {result.series.test_size}</span>
                <span className="chip">Rows (real): {result.rows.real}</span>
                <span className="chip">Rows (augmented): {result.rows.augmented}</span>
              </div>

              <div className="chips">
                <span className="chip">MAE: {formatNumber(result.metrics.model.mae)}</span>
                <span className="chip">RMSE: {formatNumber(result.metrics.model.rmse)}</span>
                <span className="chip">MAPE: {formatPercent(result.metrics.model.mape)}</span>
                <span className="chip">R²: {typeof result.metrics.model.r2 === 'number' ? result.metrics.model.r2.toFixed(3) : 'n/a'}</span>
                {typeof result.metrics.baseline.rmse === 'number' && (
                  <span className="chip">Baseline RMSE: {formatNumber(result.metrics.baseline.rmse)}</span>
                )}
              </div>

              {typeof improvement === 'number' && (
                <div className="muted">RMSE improvement vs baseline: {improvement >= 0 ? '+' : ''}{improvement.toFixed(2)}</div>
              )}

              <div className="card">
                <div className="card-header">Historical fit & forward forecast</div>
                <div className="card-body">
                  <ForecastChart
                    labels={labels}
                    estimate={estimateStub}
                    demand={seriesValues}
                    supply={estimateStub}
                    height={320}
                  />
                </div>
              </div>

              <div className="card">
                <div className="card-header">Hold-out evaluation</div>
                <div className="card-body" style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ minWidth: 420 }}>
                    <thead>
                      <tr>
                        <th>Quarter</th>
                        <th>Actual</th>
                        <th>Predicted</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testRows.map((row) => (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td>{formatNumber(row.actual)}</td>
                          <td>{formatNumber(row.predicted)}</td>
                          <td>{row.error != null ? formatNumber(row.error) : 'n/a'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {testRows.length === 0 && <div className="muted">Not enough quarters for a test split.</div>}
                </div>
              </div>
            </>
          ) : (
            <div className="muted">
              {status === 'running'
                ? 'Waiting for training to finish…'
                : counterpart
                  ? 'No run for this dataset yet. Try switching tabs or refresh once more data is available.'
                  : 'Upload a dataset with quarter-series columns to trigger automatic training.'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (abs >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `${value.toFixed(2)}%`;
}

export default Admin;
