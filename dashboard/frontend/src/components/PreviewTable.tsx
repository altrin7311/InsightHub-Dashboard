import React from "react";

type Props = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

const PreviewTable: React.FC<Props> = ({ columns, rows }) => {
  const [search, setSearch] = React.useState('');
  const [visibleCols, setVisibleCols] = React.useState<string[]>(columns);

  React.useEffect(() => {
    setVisibleCols(columns);
  }, [columns.join('|')]);

  const filteredColumnNames = React.useMemo(() => {
    if (!search.trim()) return columns;
    const q = search.trim().toLowerCase();
    return columns.filter((col) => col.toLowerCase().includes(q));
  }, [columns, search]);

  const toggleColumn = (col: string) => {
    setVisibleCols((prev) => {
      if (prev.includes(col)) {
        if (prev.length === 1) return prev; // keep at least one column visible
        return prev.filter((c) => c !== col);
      }
      return [...prev, col];
    });
  };

  const displayColumns = React.useMemo(() => {
    const next = columns.filter((col) => visibleCols.includes(col));
    return next.length ? next : columns.slice(0, Math.min(5, columns.length));
  }, [columns, visibleCols]);

  return (
    <div className="preview-container table-wrap">
      <div className="table-header">
        <span>Data Preview (first 10 rows)</span>
        <div className="table-toolbar">
          <input
            className="table-search"
            type="search"
            placeholder="Search columns"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="table-toolbar" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <div className="table-checkboxes">
          {filteredColumnNames.map((col) => {
            const checked = visibleCols.includes(col);
            const disabled = checked && visibleCols.length === 1;
            return (
              <label key={col}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleColumn(col)}
                />
                {col}
              </label>
            );
          })}
          {!filteredColumnNames.length && <span className="muted">No columns match.</span>}
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {displayColumns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={displayColumns.length} style={{ textAlign: "center", color: "#9ca3af", padding: 18 }}>
                  No rows to display
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={idx}>
                  {displayColumns.map((col) => (
                    <td key={col}>{formatCell(row[col])}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? value.toString() : `${(+value).toLocaleString(undefined, { maximumFractionDigits: 3 })}`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default PreviewTable;
