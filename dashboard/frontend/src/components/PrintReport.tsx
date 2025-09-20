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

  return (
    <div className="print-prep" style={{ padding: 16 }}>
      <div style={{ marginBottom: 8, pageBreakAfter: 'avoid' }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>InsightHub — Executive Resource Management</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date().toLocaleString()}</div>
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
