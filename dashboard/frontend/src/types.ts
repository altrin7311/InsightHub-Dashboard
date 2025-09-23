export interface TrainingRunResult {
  rows: { real: number; augmented: number };
  series: { labels: string[]; base: number[]; train_size: number; test_size: number };
  pred: { test_labels: string[]; test_actual: number[]; test_pred: number[] };
  metrics: { model: Record<string, number | null>; baseline: Record<string, number | null>; name?: string };
  forecast: { labels: string[]; values: number[] };
}

export interface TrainingRecord {
  status: "ok" | "running" | "error";
  timestamp: string;
  augmented: boolean;
  result: TrainingRunResult | null;
  error: string | null;
  horizon: number;
}

export interface UploadResponse {
  filename: string;
  columns: string[];
  preview: Array<Record<string, unknown>>;
  row_count?: number;
  aug_preview?: Array<Record<string, unknown>>;
  aug_row_count?: number;
  schema?: {
    project?: string | null;
    area?: string | null;
    demand?: string | null;
    supply?: string | null;
    class?: string | null;
    start?: string | null;
    end?: string | null;
  };
  metrics?: {
    total_demand?: number | null;
    total_supply?: number | null;
    class_counts?: { demand: number; supply: number; other: number } | null;
    projects?: number | null;
    areas?: number | null;
    utilization_rate?: number | null;
  };
  timeseries?: {
    labels: string[];
    estimate: number[];
    demand: number[];
    supply: number[];
    ci?: { lower: number[]; upper: number[] };
    forecast?: { labels: string[]; values: number[]; ci?: { lower: number[]; upper: number[] } };
  } | null;
  ml?: {
    labels: string[];
    forecast: number[];
    ci?: { lower: number[]; upper: number[] };
  } | null;
  bottlenecks?: Array<{
    project?: string | null;
    trial?: string | null;
    area?: string | null;
    demand_total: number;
    estimate_total: number;
    gap: number;
  }> | null;
  filters?: {
    projects: string[];
    trials: string[];
    areas: string[];
    quarters: string[];
    phases: string[];
  };
  training?: {
    real?: TrainingRecord | null;
    augmented?: TrainingRecord | null;
  } | null;
  area_quarter_matrix?: Array<{
    quarter: string;
    area: string;
    estimate: number;
    demand: number;
    supply: number;
    gap: number;
    utilization: number | null;
  }> | null;
  area_totals?: Array<{
    area: string;
    estimate: number;
    demand: number;
    supply: number;
  }> | null;
}
