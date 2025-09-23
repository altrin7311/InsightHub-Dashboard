import React from 'react';
import type { UploadResponse } from '../types';
import type { Filters } from './FiltersBar';
import Dashboard from './Dashboard';
import ForecastChart from './ForecastChart';
import Forecasting from './Forecasting';

type Props = {
  data: UploadResponse;
  filters?: Filters;
};

// Renders a multi-section printable report. Hidden on screen; shown only for print.
const PrintReport: React.FC<Props> = ({ data, filters }) => {
  const ts = data.timeseries;
  const generatedAt = React.useMemo(() => new Date().toLocaleString(), []);
  const filterSummary = React.useMemo(() => {
    if (!filters) return [] as string[];
    const chips: string[] = [];
    if (filters.project) chips.push(`Project: ${filters.project}`);
    if (filters.trial) chips.push(`Trial: ${filters.trial}`);
    if (filters.area) chips.push(`Area: ${filters.area}`);
    if (filters.quarter) chips.push(`Quarter: ${filters.quarter}`);
    chips.push(`Dataset: ${filters.augmented === false ? 'Real only' : 'Real + Synthetic'}`);
    return chips;
  }, [filters]);

  return (
    <div className="print-prep" style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, pageBreakAfter: 'avoid' }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>InsightHub — Executive Resource Management</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Generated {generatedAt}</div>
        {filterSummary.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
            {filterSummary.map((chip, idx) => (
              <span key={`${chip}-${idx}`} style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '4px 8px' }}>{chip}</span>
            ))}
          </div>
        )}
      </div>

      {/* Summary dashboard */}
      <div>
        <Dashboard data={data} filters={filters} />
      </div>

      {/* Estimate vs Demand */}
      {ts && (
        <div style={{ marginTop: 12, pageBreakBefore: 'always' }}>
          <div className="card">
            <div className="card-header">Estimate vs Demand</div>
            <div className="card-body">
              <ForecastChart
                labels={ts.labels}
                estimate={ts.estimate}
                demand={ts.demand}
                supply={ts.supply}
                band={ts.ci}
                height={360}
                animate={false}
                highlightGap="estimate-demand"
                useBrush={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* FTE Trend (proxy) */}
      {ts && (
        <div style={{ marginTop: 12, pageBreakBefore: 'always' }}>
          <div className="card">
            <div className="card-header">FTE Trend</div>
            <div className="card-body">
              <ForecastChart
                labels={ts.labels}
                estimate={ts.estimate}
                demand={ts.estimate}
                supply={ts.estimate}
                height={320}
                animate={false}
                useBrush={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Forecasting page */}
      <div style={{ marginTop: 12, pageBreakBefore: 'always' }}>
        <Forecasting data={data} />
      </div>
    </div>
  );
};

export default PrintReport;
