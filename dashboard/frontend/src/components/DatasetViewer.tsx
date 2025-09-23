import React from "react";
import './DatasetViewer.css';

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://127.0.0.1:8000";

type DatasetKind = "real" | "augmented";

type DatasetResponse = {
  dataset: DatasetKind;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const DatasetViewer: React.FC = () => {
  const params = React.useMemo(() => new URLSearchParams(window.location.search), []);
  const datasetParam = params.get("dataset")?.toLowerCase() === "aug" ? "augmented" : "real";
  const [data, setData] = React.useState<DatasetResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const dataset = datasetParam as DatasetKind;

  const fetchPage = React.useCallback(async (nextPage: number, nextSize: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/dataset?dataset=${dataset}&page=${nextPage}&page_size=${nextSize}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to load dataset (HTTP ${res.status})`);
      }
      const json = (await res.json()) as DatasetResponse;
      setData(json);
      setPage(json.page);
      setPageSize(json.page_size);
    } catch (err: any) {
      setError(err?.message || "Failed to load dataset");
    } finally {
      setLoading(false);
    }
  }, [dataset]);

  React.useEffect(() => {
    fetchPage(1, pageSize);
  }, [fetchPage]);

  const onDownload = React.useCallback((format: "csv" | "xlsx") => {
    const url = `${API_BASE}/dataset/download?dataset=${dataset}&fmt=${format}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [dataset]);

  const totalPages = data?.total_pages ?? 1;
  const goToPage = (next: number) => {
    const clamped = Math.max(1, Math.min(totalPages, next));
    fetchPage(clamped, pageSize);
  };

  const onPageSizeChange = (evt: React.ChangeEvent<HTMLSelectElement>) => {
    const next = Number(evt.target.value) || 50;
    fetchPage(1, next);
  };

  return (
    <div className="viewer-shell">
      <header className="viewer-header">
        <a className="breadcrumb" href="/">← Back to dashboard</a>
        <h1>{dataset === "augmented" ? "Real + Synthetic Dataset" : "Real Dataset"}</h1>
        <div className="viewer-actions">
          <button className="btn" onClick={() => onDownload("csv")}>Download CSV</button>
          <button className="btn btn-secondary" onClick={() => onDownload("xlsx")}>Download XLSX</button>
        </div>
      </header>

      <section className="viewer-table-card">
        <div className="viewer-controls">
          <div className="control-group">
            <span className="label">Page size</span>
            <select value={pageSize} onChange={onPageSizeChange}>
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <button className="btn btn-ghost" onClick={() => goToPage(page - 1)} disabled={page <= 1}>Prev</button>
            <span className="muted">Page {page} of {totalPages}</span>
            <button className="btn btn-ghost" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>Next</button>
          </div>
        </div>

        {loading && <div className="muted" style={{ padding: 24 }}>Loading dataset…</div>}
        {error && <div className="alert" style={{ marginBottom: 16 }}>{error}</div>}

        {!loading && data && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {data.columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={data.columns.length} className="muted" style={{ textAlign: 'center' }}>No rows available.</td>
                  </tr>
                ) : (
                  data.rows.map((row, idx) => (
                    <tr key={idx}>
                      {data.columns.map((col) => (
                        <td key={col}>{formatCell(row[col])}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toString();
    return Number(value).toFixed(2);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export default DatasetViewer;
