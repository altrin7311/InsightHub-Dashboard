import React from "react";
import type { UploadResponse } from "../types";
import ForecastChart from "./ForecastChart";
import ChartActions from "./ChartActions";
import { extendSeriesToYear, parseQuarter } from "../lib/time";

type Props = { data: UploadResponse };

const Forecasting: React.FC<Props> = ({ data }) => {
  const [mode, setMode] = React.useState<"quarter" | "year">("quarter");

  const ts = data.timeseries;

  // Aggregate by year if user selects Year mode
  const { labels, estimate, demand, supply, band } = React.useMemo(() => {
    if (!ts) return { labels: [] as string[], estimate: [] as number[], demand: [] as number[], supply: [] as number[], band: undefined as any };

    const lastKnown = ts.labels?.length ? parseQuarter(ts.labels[ts.labels.length - 1] || '') : null;
    const targetYear = lastKnown ? lastKnown.year + 2 : undefined;

    const extended = extendSeriesToYear(
      {
        labels: ts.labels,
        estimate: ts.estimate,
        demand: ts.demand,
        supply: ts.supply,
        ci: ts.ci,
        forecast: ts.forecast ? { labels: ts.forecast.labels, values: ts.forecast.values, ci: ts.forecast.ci } : undefined,
      },
      {
        mlForecast: data.ml ? { labels: data.ml.labels, values: data.ml.forecast, ci: data.ml.ci } : undefined,
        targetYear,
        maxFutureQuarters: 8,
      }
    );

    if (mode === "quarter") {
      return {
        labels: extended.labels,
        estimate: extended.estimate,
        demand: extended.demand,
        supply: extended.supply,
        band: extended.ci,
      };
    }
    // Year aggregation
    const map = new Map<string, { e: number; d: number; s: number; l?: number; u?: number }>();
    const yearOf = (label: string) => {
      const m = /(?:Q\d+\s+)?(\d{4})/.exec(label);
      return m ? m[1] : label;
    };
    extended.labels.forEach((lab: string, i: number) => {
      const y = yearOf(lab);
      const obj = map.get(y) || { e: 0, d: 0, s: 0, l: 0, u: 0 };
      obj.e += extended.estimate[i] ?? 0;
      obj.d += extended.demand[i] ?? 0;
      obj.s += extended.supply[i] ?? 0;
      if (extended.ci) {
        obj.l = (obj.l || 0) + (extended.ci.lower[i] ?? 0);
        obj.u = (obj.u || 0) + (extended.ci.upper[i] ?? 0);
      }
      map.set(y, obj);
    });
    const ys = Array.from(map.keys()).sort();
    return {
      labels: ys,
      estimate: ys.map((y) => Math.round((map.get(y)?.e ?? 0) * 1000) / 1000),
      demand: ys.map((y) => Math.round((map.get(y)?.d ?? 0) * 1000) / 1000),
      supply: ys.map((y) => Math.round((map.get(y)?.s ?? 0) * 1000) / 1000),
      band: extended.ci ? { lower: ys.map((y) => map.get(y)?.l ?? 0), upper: ys.map((y) => map.get(y)?.u ?? 0) } : undefined,
    };
  }, [ts, mode, data.ml]);

  return (
    <section className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Forecast</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className={`btn ${mode === "quarter" ? "btn-secondary" : "btn-ghost"}`} onClick={() => setMode("quarter")}>Quarter</button>
            <button className={`btn ${mode === "year" ? "btn-secondary" : "btn-ghost"}`} onClick={() => setMode("year")}>Year</button>
          </div>
        </div>
        <div className="card-body">
          {!ts || labels.length === 0 ? (
            <div className="muted">No timeseries detected from quarter columns.</div>
          ) : (
            <>
              <ChartActions
                filename="forecast-series"
                csvRows={labels.map((label, idx) => ({
                  label,
                  estimate: estimate[idx] ?? null,
                  demand: demand[idx] ?? null,
                  supply: supply[idx] ?? null,
                }))}
              />
              <ForecastChart
                labels={labels}
                estimate={estimate}
                demand={demand}
                supply={supply.length ? supply : (data.ml?.forecast || [])}
                band={band || (data.ml?.ci ? { lower: data.ml!.ci!.lower, upper: data.ml!.ci!.upper } : undefined)}
                height={380}
                highlightGap="demand-supply"
                useBrush={false}
              />
            </>
          )}
          <div className="muted" style={{ marginTop: 8 }}>
            Data points: {labels.length}. Source: aggregated from columns like “Q1 23 Estimate/Demand”.
          </div>
        </div>
      </div>
    </section>
  );
};

export default Forecasting;
