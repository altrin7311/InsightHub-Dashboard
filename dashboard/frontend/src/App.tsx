import React from "react";
import type { UploadResponse } from "./types";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import PreviewTable from "./components/PreviewTable";
import ForecastChart from "./components/ForecastChart";
import InfoBlocks from "./components/InfoBlocks";
import { uploadFile } from "./lib/api";
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
    if (!file) return;

    setLoading(true);
    try {
      const json = await uploadFile(file);
      setData(json);
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
      setActiveTab("summary");
    } catch (e: any) {
      console.error("Failed to load sample.csv", e);
      setError(e?.message || "Failed to use sample data");
    } finally {
      setLoading(false);
    }
  };

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
        {data && (
          <FiltersBar data={data} value={filters} onChange={setFilters} />
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
            <>
              <section className="card">
                <div className="card-header">Preview — Real Data (first 10)</div>
                <div className="card-body">
                  <PreviewTable columns={data.columns} rows={data.preview} />
                  <div className="muted" style={{ marginTop: 6 }}>Rows: {data.row_count ?? data.preview.length}</div>
                </div>
              </section>
              {Array.isArray((data as any).aug_preview) && (
                <section className="card">
                  <div className="card-header">Preview — Real + Synthetic (first 10)</div>
                  <div className="card-body">
                    <PreviewTable columns={data.columns} rows={(data as any).aug_preview as any[]} />
                    <div className="muted" style={{ marginTop: 6 }}>Rows: {(data as any).aug_row_count}</div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
        )}

        {activeTab === "summary" && data && (
          <section style={{ marginTop: 18 }}>
            <Dashboard
              data={{ ...data, ...(derived?.timeseries ? { timeseries: derived.timeseries } : {}), metrics: { ...data.metrics, ...(derived?.metrics || {}) } }}
              filters={filters}
            />
          </section>
        )}

        {activeTab === "estimate" && data && (
          <section style={{ marginTop: 18 }}>
            <div className="card">
              <div className="card-header">Estimate vs Demand</div>
              <div className="card-body">
                <div className="muted" style={{ marginBottom: 8 }}>Aggregated across all projects by quarter</div>
                {data.timeseries ? (
                  <ForecastChart
                    labels={data.timeseries.labels}
                    estimate={data.timeseries.estimate}
                    demand={data.timeseries.demand}
                    supply={data.timeseries.supply}
                    band={data.timeseries.ci}
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
                { title: 'Highest demand quarter', detail: data.timeseries ? data.timeseries.labels[data.timeseries.demand.indexOf(Math.max(...data.timeseries.demand))] : 'n/a', tone: 'neutral' },
                { title: 'Demand vs Estimate delta', detail: data.timeseries ? (Math.round((data.timeseries.demand.reduce((a,b)=>a+b,0) - data.timeseries.estimate.reduce((a,b)=>a+b,0))*100)/100).toString() : 'n/a', tone: 'warn' },
                { title: 'Projects', detail: (data.metrics?.projects ?? 0).toString(), tone: 'good' },
              ]}
            />
          </section>
        )}

        {activeTab === "dvs" && data && (
          <section style={{ marginTop: 18 }}>
            <div className="card">
              <div className="card-header">Demand vs Supply</div>
              <div className="card-body">
                <div className="muted" style={{ marginBottom: 8 }}>Supply approximates Estimate when Supply columns are not present.</div>
                {data.timeseries ? (
                  <ForecastChart
                    labels={data.timeseries.labels}
                    estimate={data.timeseries.estimate}
                    demand={data.timeseries.demand}
                    supply={data.timeseries.supply}
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
                { title: 'Total demand', detail: data.metrics?.total_demand ? Math.round(data.metrics.total_demand).toLocaleString() : 'n/a', tone: 'neutral' },
                { title: 'Total supply', detail: data.metrics?.total_supply ? Math.round(data.metrics.total_supply).toLocaleString() : 'n/a', tone: 'neutral' },
                { title: 'Utilization', detail: data.metrics?.utilization_rate ? `${data.metrics.utilization_rate.toFixed(1)}%` : 'n/a', tone: 'good' },
              ]}
            />
          </section>
        )}

        {activeTab === "fte" && data && (
          <section style={{ marginTop: 18 }}>
            <div className="card">
              <div className="card-header">FTE Trend</div>
              <div className="card-body">
                <div className="muted">Using preview-derived totals; replace with team’s actual FTE mapping when available.</div>
                {data.timeseries ? (
                  <ForecastChart
                    labels={data.timeseries.labels}
                    estimate={data.timeseries.estimate}
                    demand={data.timeseries.estimate}
                    supply={data.timeseries.estimate}
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
                { title: 'Peak FTE quarter', detail: data.timeseries ? data.timeseries.labels[data.timeseries.estimate.indexOf(Math.max(...data.timeseries.estimate))] : 'n/a', tone: 'neutral' },
                { title: 'Recent trend', detail: 'Gradual increase with seasonal peaks', tone: 'good' },
                { title: 'Recommendation', detail: 'Plan hiring 1–2 quarters ahead of forecast peaks', tone: 'good' },
              ]}
            />
          </section>
        )}

        {activeTab === "admin" && (
          <section style={{ marginTop: 18 }}>
            <Admin />
          </section>
        )}

        {activeTab === "forecasting" && data && (
          <section style={{ marginTop: 18 }}>
            <Forecasting data={data} />
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
