import React from "react";
import type { UploadResponse } from "./types";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import ForecastChart from "./components/ForecastChart";
import InfoBlocks from "./components/InfoBlocks";
import { uploadFile, fetchTrainingResults } from "./lib/api";
import SignIn from "./components/SignIn";
import Tabs, { type TabKey } from "./components/Tabs";
import Chatbot from "./components/Chatbot";
import Forecasting from "./components/Forecasting";
import Admin from "./components/Admin";
import FiltersBar, { type Filters } from "./components/FiltersBar";
import PrintReport from "./components/PrintReport";

const App: React.FC = () => {
  const [file, setFile] = React.useState<File | null>(null);
  const [data, setData] = React.useState<UploadResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<TabKey>("upload");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [filters, setFilters] = React.useState<Filters>({});
  const [derived, setDerived] = React.useState<{ metrics?: any; timeseries?: any } | null>(null);
  const [printing, setPrinting] = React.useState(false);
  const [user, setUser] = React.useState<{ email: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem("auth_user") || "null"); } catch { return null; }
  });
  const [training, setTraining] = React.useState<UploadResponse["training"] | null>(null);

  const mergedMetrics = React.useMemo(() => {
    if (!data) return derived?.metrics || {};
    return { ...(data.metrics || {}), ...(derived?.metrics || {}) };
  }, [data, derived?.metrics]);

  const mergedTimeseries = React.useMemo(() => {
    if (derived?.timeseries) return derived.timeseries;
    return data?.timeseries ?? null;
  }, [derived?.timeseries, data?.timeseries]);

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        setFile(files[0]);
      }
    };
    window.addEventListener("paste", onPaste as any);
    return () => window.removeEventListener("paste", onPaste as any);
  }, []);

  // Handle export PDF flow triggered from Header
  React.useEffect(() => {
    const open = () => setPrinting(true);
    const after = () => setPrinting(false);
    window.addEventListener('open-print-report', open as any);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('open-print-report', open as any);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  React.useEffect(() => {
    if (!printing) return;
    // Allow the print-only components to mount and measure
    const id = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      window.print();
    }, 500);
    return () => clearTimeout(id);
  }, [printing]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setData(null);
    setDerived(null);
    setTraining(null);
    if (!file) return;

    setLoading(true);
    try {
      const json = await uploadFile(file);
      setData(json);
      setTraining(json.training ?? null);
      setActiveTab("summary");
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setData(null);
    setError(null);
    setDerived(null);
    setTraining(null);
    setFilters({});
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };
  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => { e.preventDefault(); setDrag(true); };
  const onDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => { e.preventDefault(); setDrag(false); };

  const size = file ? readableBytes(file.size) : null;
  const useSample = async () => {
    try {
      const res = await fetch("/sample.csv");
      const blob = await res.blob();
      const f = new File([blob], "sample.csv", { type: "text/csv" });
      setFile(f);
      setLoading(true);
      setError(null);
      const json = await uploadFile(f);
      setData(json);
      setTraining(json.training ?? null);
      setActiveTab("summary");
    } catch (e: any) {
      console.error("Failed to load sample.csv", e);
      setError(e?.message || "Failed to use sample data");
    } finally {
      setLoading(false);
    }
  };

  const openDataViewer = React.useCallback((dataset: 'real' | 'aug') => {
    const url = new URL(window.location.href);
    url.pathname = '/viewer';
    url.search = dataset === 'aug' ? '?dataset=aug' : '?dataset=real';
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }, []);

  const enrichedData = React.useMemo(() => {
    if (!data) return null;
    const merged: UploadResponse = {
      ...data,
      metrics: mergedMetrics,
      ...(mergedTimeseries ? { timeseries: mergedTimeseries } : {}),
      ...(training ? { training } : {}),
    };
    return merged;
  }, [data, mergedMetrics, mergedTimeseries, training]);

  React.useEffect(() => {
    const run = async () => {
      if (!data) return;
      const base = (import.meta as any).env?.VITE_API_BASE ?? "http://127.0.0.1:8000";
      try {
        const res = await fetch(base + "/metrics", { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(filters) });
        if (res.ok) setDerived(await res.json());
      } catch {}
    };
    run();
  }, [JSON.stringify(filters), !!data]);

  React.useEffect(() => {
    if (!data) return;
    const hasTraining = training?.real || training?.augmented;
    let disposed = false;
    let retryHandle: number | undefined;

    const schedule = (delay: number) => {
      retryHandle = window.setTimeout(async () => {
        try {
          const latest = await fetchTrainingResults();
          if (disposed) return;
          const nextTraining = { real: latest.real ?? null, augmented: latest.augmented ?? null } as UploadResponse["training"];
          setTraining(nextTraining);
          if ((latest.real?.status === "running") || (latest.augmented?.status === "running")) {
            schedule(1500);
          }
        } catch {
          if (!disposed) {
            schedule(3000);
          }
        }
      }, delay);
    };

    if (!hasTraining || training?.real?.status === "running" || training?.augmented?.status === "running") {
      schedule(hasTraining ? 1200 : 400);
    }

    return () => {
      disposed = true;
      if (retryHandle) window.clearTimeout(retryHandle);
    };
  }, [data, training?.real?.status, training?.augmented?.status]);

  React.useEffect(() => {
    if (!data) return;
    if (training) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await fetchTrainingResults();
        if (!cancelled) {
          setTraining({ real: latest.real ?? null, augmented: latest.augmented ?? null });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [data, training]);

  if (!user) {
    return <SignIn onSuccess={(email) => setUser({ email })} />;
  }

  return (
    <div>
      <Header onSignOut={() => { localStorage.removeItem("auth_user"); setUser(null); }} />

      <main className="container">
        {/* Hidden during screen; rendered for print */}
        {printing && data && (
          <PrintReport data={{ ...data, ...(derived?.timeseries ? { timeseries: derived.timeseries } : {}), metrics: { ...data.metrics, ...(derived?.metrics || {}) } }} filters={filters} />
        )}
        {enrichedData && (
          <FiltersBar data={enrichedData} value={filters} onChange={setFilters} />
        )}
        <Tabs active={activeTab} onChange={setActiveTab} disabled={{ summary: !data, estimate: !data, dvs: !data, fte: !data, forecasting: !data, admin: false }} />
        {activeTab === "upload" && (
        <div className="grid">
          <section className="card" aria-label="Upload">
            <div className="card-header">Upload Trial Data (.xlsx, .xls, .csv)</div>
            <div className="card-body">
              <div
                className={`dropzone ${drag ? "drag" : ""}`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => inputRef.current?.click()}
                role="button"
                aria-label="Choose or drop file"
              >
                <div>
                  <div style={{ fontWeight: 700 }}>Drag & drop your Excel/CSV here</div>
                  <div className="hint">or click to browse</div>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <form onSubmit={onSubmit} style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
                {file ? (
                  <span className="pill" title={file.name}>
                    {file.name}
                    <span className="muted" style={{ marginLeft: 8 }}>• {size}</span>
                  </span>
                ) : (
                  <span className="muted">No file selected</span>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()}>
                    Browse
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={!file || loading}>
                    {loading ? "Uploading…" : "Upload & Preview"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={reset}>Reset</button>
                  <button type="button" className="btn btn-ghost" onClick={useSample}>Use Sample</button>
                </div>
              </form>
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Tip: You can also paste a file from clipboard <span className="kbd">⌘/Ctrl + V</span>
              </div>

              {error && (
                <div className="alert" style={{ marginTop: 12 }} role="alert" aria-live="polite">{error}</div>
              )}
            </div>
          </section>
          {data && (
            <div className="preview-tab-bar" style={{ marginTop: 18 }}>
              <button type="button" className="preview-tab" onClick={() => openDataViewer('real')}>
                Preview — Real Data
              </button>
              {Array.isArray((data as any).aug_preview) && (
                <button type="button" className="preview-tab" onClick={() => openDataViewer('aug')}>
                  Preview — Real + Synthetic
                </button>
              )}
              <span className="preview-tab-hint">Opens new tab with full dataset & download.</span>
            </div>
          )}
        </div>
        )}

        {activeTab === "summary" && enrichedData && (
          <section style={{ marginTop: 18 }}>
            <Dashboard data={enrichedData} filters={filters} />
          </section>
        )}

        {activeTab === "estimate" && enrichedData && (
          <section style={{ marginTop: 18 }}>
            <div className="card">
              <div className="card-header">Estimate vs Demand</div>
              <div className="card-body">
                <div className="muted" style={{ marginBottom: 8 }}>Aggregated across all projects by quarter</div>
                {enrichedData.timeseries ? (
                  <ForecastChart
                    labels={enrichedData.timeseries.labels}
                    estimate={enrichedData.timeseries.estimate}
                    demand={enrichedData.timeseries.demand}
                    supply={enrichedData.timeseries.supply}
                    band={enrichedData.timeseries.ci}
                    height={360}
                    highlightGap="estimate-demand"
                  />
                ) : (
                  <div className="muted">No timeseries detected from quarter columns.</div>
                )}
              </div>
            </div>
            <div style={{ height: 12 }} />
            <InfoBlocks
              heading="Insights"
              items={[
                { title: 'Highest demand quarter', detail: enrichedData.timeseries ? enrichedData.timeseries.labels[enrichedData.timeseries.demand.indexOf(Math.max(...enrichedData.timeseries.demand))] : 'n/a', tone: 'neutral' },
                { title: 'Demand vs Estimate delta', detail: enrichedData.timeseries ? (Math.round((enrichedData.timeseries.demand.reduce((a,b)=>a+b,0) - enrichedData.timeseries.estimate.reduce((a,b)=>a+b,0))*100)/100).toString() : 'n/a', tone: 'warn' },
                { title: 'Projects', detail: (enrichedData.metrics?.projects ?? 0).toString(), tone: 'good' },
              ]}
            />
          </section>
        )}

        {activeTab === "dvs" && enrichedData && (
          <section style={{ marginTop: 18 }}>
            <div className="card">
              <div className="card-header">Demand vs Supply</div>
              <div className="card-body">
                <div className="muted" style={{ marginBottom: 8 }}>Supply approximates Estimate when Supply columns are not present.</div>
                {enrichedData.timeseries ? (
                  <ForecastChart
                    labels={enrichedData.timeseries.labels}
                    estimate={enrichedData.timeseries.estimate}
                    demand={enrichedData.timeseries.demand}
                    supply={enrichedData.timeseries.supply}
                    height={360}
                    highlightGap="demand-supply"
                  />
                ) : (
                  <div className="muted">No timeseries detected from quarter columns.</div>
                )}
              </div>
            </div>
            <div style={{ height: 12 }} />
            <InfoBlocks
              heading="Demand vs Supply Notes"
              items={[
                { title: 'Total demand', detail: enrichedData.metrics?.total_demand ? Math.round(enrichedData.metrics.total_demand).toLocaleString() : 'n/a', tone: 'neutral' },
                { title: 'Total supply', detail: enrichedData.metrics?.total_supply ? Math.round(enrichedData.metrics.total_supply).toLocaleString() : 'n/a', tone: 'neutral' },
                { title: 'Utilization', detail: enrichedData.metrics?.utilization_rate ? `${enrichedData.metrics.utilization_rate.toFixed(1)}%` : 'n/a', tone: 'good' },
              ]}
            />
          </section>
        )}

        {activeTab === "fte" && enrichedData && (
          <section style={{ marginTop: 18 }}>
            <div className="card">
              <div className="card-header">FTE Trend</div>
              <div className="card-body">
                <div className="muted">Using preview-derived totals; replace with team’s actual FTE mapping when available.</div>
                {enrichedData.timeseries ? (
                  <ForecastChart
                    labels={enrichedData.timeseries.labels}
                    estimate={enrichedData.timeseries.estimate}
                    demand={enrichedData.timeseries.estimate}
                    supply={enrichedData.timeseries.estimate}
                    height={300}
                  />
                ) : (
                  <div className="muted">No FTE-proxy series available.</div>
                )}
              </div>
            </div>
            <div style={{ height: 12 }} />
            <InfoBlocks
              heading="FTE Highlights"
              items={[
                { title: 'Peak FTE quarter', detail: enrichedData.timeseries ? enrichedData.timeseries.labels[enrichedData.timeseries.estimate.indexOf(Math.max(...enrichedData.timeseries.estimate))] : 'n/a', tone: 'neutral' },
                { title: 'Recent trend', detail: 'Gradual increase with seasonal peaks', tone: 'good' },
                { title: 'Recommendation', detail: 'Plan hiring 1–2 quarters ahead of forecast peaks', tone: 'good' },
              ]}
            />
          </section>
        )}

        {activeTab === "admin" && enrichedData && (
          <section style={{ marginTop: 18 }}>
            <Admin data={enrichedData} onRefreshTraining={async () => {
              try {
                const latest = await fetchTrainingResults();
                setTraining({ real: latest.real ?? null, augmented: latest.augmented ?? null });
              } catch {}
            }} />
          </section>
        )}

        {activeTab === "forecasting" && enrichedData && (
          <section style={{ marginTop: 18 }}>
            <Forecasting data={enrichedData} />
          </section>
        )}

        {activeTab !== "upload" && !data && (
          <section className="card" style={{ marginTop: 18 }}>
            <div className="card-header">No dataset loaded</div>
            <div className="card-body">Please upload a file in the Upload tab to populate the dashboard.</div>
          </section>
        )}
      </main>
      <Chatbot context={data || undefined} />
    </div>
  );
};

function readableBytes(bytes: number): string {
  const sizes = ["B", "KB", "MB", "GB", "TB"] as const;
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

export default App;
