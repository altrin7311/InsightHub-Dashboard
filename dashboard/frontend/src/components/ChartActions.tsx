import React from "react";

type Props = {
  targetRef?: React.RefObject<HTMLElement | null> | any;
  filename?: string;
  csvRows?: Record<string, any>[];
};

const ChartActions: React.FC<Props> = ({ targetRef: _targetRef, filename = "chart", csvRows = [] }) => {
  const downloadCSV = () => {
    if (!csvRows.length) return;

    const headers = Object.keys(csvRows[0]);
    const csvContent = [
      headers.join(","),
      ...csvRows.map(r => headers.map(h => r[h]).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const event = new Event('open-print-report');
    window.dispatchEvent(event);
  };

  return (
    <div className="chart-actions">
      <button onClick={downloadCSV} title="Download this chart as CSV" aria-label="Download chart CSV" disabled={!csvRows.length}>
        Download CSV
      </button>
      <button onClick={exportPDF} title="Export this chart to PDF" aria-label="Export chart to PDF">
        Export PDF
      </button>
    </div>
  );
};

export default ChartActions;
