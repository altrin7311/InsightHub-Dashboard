import React from "react";
import type { UploadResponse } from "../types";
import ForecastChart from "./ForecastChart";
import type { Filters } from "./FiltersBar";
import MiniBarChart from "./MiniBarChart";
import DonutChart from "./DonutChart";
import HeatmapGrid from "./HeatmapGrid";
import StackedBars from "./StackedBars";
import ChartLine from "./ChartLine";
import ChartActions from "./ChartActions";
import { parseQuarter, formatQuarter } from "../lib/time";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Brush } from "recharts";

function useCountUp(value: number | undefined, decimals = 0, duration = 900) {
  const [display, setDisplay] = React.useState(0);
  React.useEffect(() => {
    if (!Number.isFinite(value)) {
      setDisplay(0);
      return;
    }
    const target = Number(value);
    const start = performance.now();
    let raf: number;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(target * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  if (!Number.isFinite(value)) return undefined;
  return Number(display.toFixed(decimals));
}

type Props = { data: UploadResponse; filters?: Filters };

const AREA_COLORS = ['#60a5fa', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

const Dashboard: React.FC<Props> = ({ data, filters: externalFilters }) => {
  const cols = Array.isArray(data.columns) ? data.columns : [];
  const rows = Array.isArray(data.preview) ? data.preview : [];
  const areaQuarterMatrix = React.useMemo(() => Array.isArray(data.area_quarter_matrix) ? data.area_quarter_matrix : [], [data.area_quarter_matrix]);
  const areaTotals = React.useMemo(() => Array.isArray(data.area_totals) ? data.area_totals : [], [data.area_totals]);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const findCol = (cands: string[]): string | undefined => {
    const cn = cols.map((c) => ({ c, n: norm(c) }));
    for (const k of cands) {
      const kk = norm(k);
      const hit = cn.find((x) => x.n.includes(kk));
      if (hit) return hit.c;
    }
    return undefined;
  };

  const projectCol = findCol(["projectid", "project", "projid"]);
  const trialCol = findCol(["trialid", "trial", "trialno"]);
  const areaCol = findCol(["area", "region"]);
  const demandCol = data.schema?.demand ?? findCol(["demand"]);
  const supplyCol = data.schema?.supply ?? findCol(["supply"]);
  const estimateCol = findCol(["estimate", "actual", "fte", "headcount"]);
  const startCol = data.schema?.start ?? findCol(["fpfv", "start", "firstpatientfirstvisit"]);
  const endCol = data.schema?.end ?? findCol(["dbl", "lplv", "complete", "end", "database lock"]);
  const quarterCol = findCol(["quarter", "period", "time", "timeline"]);

  const uniq = (arr: any[]) => Array.from(new Set(arr.filter((v) => v !== undefined && v !== null))).length;

  const num = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const t = v.trim();
      const f = Number(t.replace(/,/g, ''));
      return Number.isFinite(f) ? f : NaN;
    }
    return NaN;
  };

  // Use filters passed from parent (top filter bar)
  const filters = externalFilters || {};
  const filteredRows = rows.filter((r) => {
    const okProject = !filters.project || (projectCol && String(r[projectCol]) === filters.project);
    const okTrial = !filters.trial || (trialCol && String(r[trialCol]) === filters.trial);
    const okArea = !filters.area || (areaCol && String(r[areaCol]) === filters.area);
    return okProject && okTrial && okArea;
  });

  const quarterOptions = React.useMemo(() => {
    const seen = new Map<number, string>();
    if (Array.isArray(data.timeseries?.labels)) {
      data.timeseries!.labels.forEach((label: string) => {
        const parsed = parseQuarter(String(label));
        if (parsed) {
          seen.set(parsed.key, formatQuarter(parsed.year, parsed.quarter));
        } else {
          seen.set(Number.MAX_SAFE_INTEGER - seen.size, String(label));
        }
      });
    }
    if (quarterCol) {
      for (const row of filteredRows) {
        const raw = row[quarterCol];
        if (!raw) continue;
        const parsed = parseQuarter(String(raw));
        if (parsed) {
          seen.set(parsed.key, formatQuarter(parsed.year, parsed.quarter));
        } else {
          seen.set(Number.MAX_SAFE_INTEGER / 2 + seen.size, String(raw));
        }
      }
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, label]) => label);
  }, [filteredRows, quarterCol, data.timeseries]);

  const areaOptions = React.useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(areaTotals) && areaTotals.length) {
      areaTotals.forEach((entry) => {
        if (!entry) return;
        const label = String(entry.area ?? '').trim();
        if (label) set.add(label);
      });
    }
    if (Array.isArray(areaQuarterMatrix) && areaQuarterMatrix.length) {
      areaQuarterMatrix.forEach((entry) => {
        const label = String((entry as any)?.area ?? '').trim();
        if (label) set.add(label);
      });
    }
    if (areaCol) {
      for (const row of rows) {
        const label = row[areaCol];
        if (label == null) continue;
        const value = String(label).trim();
        if (value) set.add(value);
      }
    }
    if (!set.size) set.add('All');
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [areaCol, rows, areaTotals, areaQuarterMatrix]);

  const [selectedQuarters, setSelectedQuarters] = React.useState<string[]>([]);
  const [comparisonAreas, setComparisonAreas] = React.useState<string[]>([]);
  const [quarterDraft, setQuarterDraft] = React.useState<string[]>([]);
  const [areaDraft, setAreaDraft] = React.useState<string[]>([]);
  const [highlightedGapProject, setHighlightedGapProject] = React.useState<string | null>(null);
  const [highlightedGapAreas, setHighlightedGapAreas] = React.useState<Set<string>>(new Set());
  const bottlenecksRef = React.useRef<HTMLDivElement | null>(null);
  const [estimateReasons, setEstimateReasons] = React.useState<Record<string, string>>({});
  const [reasonDraft, setReasonDraft] = React.useState('');
  const [reasonTarget, setReasonTarget] = React.useState<{ key: string; project?: string | null; trial?: string | null; area?: string | null } | null>(null);
  const [forecastView, setForecastView] = React.useState<'stacked' | 'line' | 'bar'>('stacked');

  React.useEffect(() => {
    if (!quarterOptions.length) {
      setQuarterDraft([]);
      setSelectedQuarters([]);
      return;
    }
    const fallback = quarterOptions.slice(-5);
    setQuarterDraft((prev) => {
      const normalized = prev.filter((q, idx) => quarterOptions.includes(q) && prev.indexOf(q) === idx).slice(-5);
      return normalized.length ? normalized : fallback;
    });
    setSelectedQuarters((prev) => {
      const normalized = prev.filter((q, idx) => quarterOptions.includes(q) && prev.indexOf(q) === idx).slice(-5);
      return normalized.length ? normalized : fallback;
    });
  }, [quarterOptions]);

  React.useEffect(() => {
    if (!areaOptions.length) {
      setAreaDraft([]);
      setComparisonAreas([]);
      return;
    }
    const fallback = areaOptions.slice(0, Math.min(5, areaOptions.length));
    setAreaDraft((prev) => {
      const normalized = prev.filter((a, idx) => areaOptions.includes(a) && prev.indexOf(a) === idx).slice(0, 5);
      return normalized.length ? normalized : fallback;
    });
    setComparisonAreas((prev) => {
      const normalized = prev.filter((a, idx) => areaOptions.includes(a) && prev.indexOf(a) === idx).slice(0, 5);
      return normalized.length ? normalized : fallback;
    });
  }, [areaOptions]);

  const comparisonTargetAreas = React.useMemo(() => {
    if (comparisonAreas.length) return comparisonAreas;
    if (areaQuarterMatrix.length) {
      const uniq = Array.from(new Set(areaQuarterMatrix.map((row) => String((row as any)?.area ?? '')))).filter(Boolean);
      if (uniq.length) return uniq.slice(0, 5);
    }
    if (areaOptions.length) return areaOptions.slice(0, Math.min(5, areaOptions.length));
    return ['All'];
  }, [comparisonAreas, areaQuarterMatrix, areaOptions]);

  React.useEffect(() => {
    if (!highlightedGapProject || !Array.isArray(data.bottlenecks)) {
      setHighlightedGapAreas(new Set());
      return;
    }
    const affected = new Set<string>();
    data.bottlenecks.forEach((b) => {
      const label = String(b.project || b.trial || b.area || '');
      if (label === highlightedGapProject && b.area) {
        affected.add(String(b.area));
      }
    });
    setHighlightedGapAreas(affected);
    if (bottlenecksRef.current) {
      try {
        bottlenecksRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        bottlenecksRef.current.scrollIntoView();
      }
    }
  }, [highlightedGapProject, data.bottlenecks]);

  const comparisonMatrix = React.useMemo(() => {
    if (!selectedQuarters.length) return [] as Array<{ quarter: string; area: string; estimate: number; demand: number; supply: number; gap: number; utilization: number | null }>;
    const normalizedQuarterSet = new Set(
      selectedQuarters.map((label) => {
        const parsed = parseQuarter(label);
        return parsed ? formatQuarter(parsed.year, parsed.quarter) : label;
      })
    );
    if (!normalizedQuarterSet.size) return [];
    const areaFilterSet = new Set(comparisonTargetAreas);

    const results: Array<{ quarter: string; area: string; estimate: number; demand: number; supply: number; gap: number; utilization: number | null }> = [];

    const canUseRows = Boolean(quarterCol) && Boolean(demandCol || supplyCol || estimateCol) && filteredRows.length > 0;
    if (canUseRows) {
      const buckets = new Map<string, { quarter: string; area: string; estimate: number; demand: number; supply: number }>();
      for (const row of filteredRows) {
        const rawQuarter = quarterCol ? row[quarterCol] : undefined;
        if (!rawQuarter) continue;
        const normalizedQuarter = (() => {
          const parsed = parseQuarter(String(rawQuarter));
          return parsed ? formatQuarter(parsed.year, parsed.quarter) : String(rawQuarter);
        })();
        if (!normalizedQuarterSet.has(normalizedQuarter)) continue;

        const resolvedArea = areaCol ? String(row[areaCol] ?? 'Unspecified') || 'Unspecified' : 'All';
        if (areaFilterSet.size && !areaFilterSet.has(resolvedArea)) continue;

        const valEstimate = estimateCol ? num(row[estimateCol]) : NaN;
        const valDemand = demandCol ? num(row[demandCol]) : NaN;
        const valSupply = supplyCol ? num(row[supplyCol]) : NaN;

        const key = `${normalizedQuarter}__${resolvedArea}`;
        const current = buckets.get(key) || { quarter: normalizedQuarter, area: resolvedArea, estimate: 0, demand: 0, supply: 0 };
        if (Number.isFinite(valEstimate)) current.estimate += Number(valEstimate);
        if (Number.isFinite(valDemand)) current.demand += Number(valDemand);
        if (Number.isFinite(valSupply)) current.supply += Number(valSupply);
        buckets.set(key, current);
      }

      results.push(
        ...Array.from(buckets.values()).map((entry) => {
          const supplyVal = entry.supply || (entry.estimate || entry.demand);
          const gap = entry.demand - (supplyVal ?? 0);
          const util = entry.demand > 0 ? Number((((supplyVal ?? 0) / entry.demand) * 100).toFixed(1)) : null;
          return {
            quarter: entry.quarter,
            area: entry.area,
            estimate: entry.estimate,
            demand: entry.demand,
            supply: supplyVal ?? 0,
            gap,
            utilization: util,
          };
        })
      );
    }

    if (!results.length && areaQuarterMatrix.length) {
      areaQuarterMatrix.forEach((entry) => {
        const quarterLabel = String((entry as any)?.quarter ?? '');
        const areaLabel = String((entry as any)?.area ?? 'Unspecified') || 'Unspecified';
        if (!normalizedQuarterSet.has(quarterLabel)) return;
        if (areaFilterSet.size && !areaFilterSet.has(areaLabel)) return;
        const estimateVal = Number((entry as any)?.estimate ?? 0) || 0;
        const demandVal = Number((entry as any)?.demand ?? 0) || 0;
        let supplyVal = Number((entry as any)?.supply ?? 0) || 0;
        if (!supplyVal) supplyVal = estimateVal || demandVal;
        const gap = demandVal - supplyVal;
        const util = demandVal ? Number(((supplyVal / demandVal) * 100).toFixed(1)) : null;
        results.push({
          quarter: quarterLabel,
          area: areaLabel,
          estimate: estimateVal,
          demand: demandVal,
          supply: supplyVal,
          gap,
          utilization: util,
        });
      });
    }

    if (!results.length) return results;

    const quarterIndex = new Map(selectedQuarters.map((label, idx) => [label, idx]));
    const sortQuarter = (label: string) => {
      if (quarterIndex.has(label)) return quarterIndex.get(label) || 0;
      const parsed = parseQuarter(label);
      return parsed ? parsed.key : 0;
    };

    return results.sort((a, b) => {
      const qa = sortQuarter(a.quarter);
      const qb = sortQuarter(b.quarter);
      if (qa !== qb) return qa - qb;
      return a.area.localeCompare(b.area);
    });
  }, [selectedQuarters, comparisonTargetAreas, quarterCol, demandCol, supplyCol, estimateCol, filteredRows, areaCol, areaQuarterMatrix]);

  const areaPerformanceSourceCol = supplyCol ?? demandCol ?? estimateCol;

  const recentAreaPerformance = React.useMemo(() => {
    const lastFive = quarterOptions.slice(-5);
    if (!lastFive.length) return [] as Array<Record<string, number | string | null>>;
    const normalized = lastFive.map((label) => {
      const parsed = parseQuarter(label);
      return parsed ? formatQuarter(parsed.year, parsed.quarter) : label;
    });
    const targetSet = new Set(normalized);
    type PerfBucket = {
      quarter: string;
      totalDemand: number;
      totalSupply: number;
      areas: Record<string, { demand: number; supply: number }>;
      demandPoints: number;
      supplyPoints: number;
    };
    const buildFromTemplate = (template: Map<string, PerfBucket>) => {
      const demandReady = Array.from(template.values()).some((entry) => entry.demandPoints > 0);
      const supplyReady = Array.from(template.values()).some((entry) => entry.supplyPoints > 0);
      return normalized.map((quarter) => {
        const entry = template.get(quarter) || { quarter, totalDemand: 0, totalSupply: 0, areas: {}, demandPoints: 0, supplyPoints: 0 };
        const areaSupply = Object.fromEntries(Object.entries(entry.areas).map(([name, stats]) => [name, stats.supply]));
        const baseRow: Record<string, string | number | null> = {
          quarter,
          totalDemand: demandReady ? entry.totalDemand : null,
          totalSupply: supplyReady ? entry.totalSupply : null,
          ...areaSupply,
        };
        (baseRow as any).__areas = entry.areas;
        return baseRow;
      });
    };

    if (quarterCol && areaPerformanceSourceCol) {
      const template = new Map<string, PerfBucket>();
      normalized.forEach((q) => {
        template.set(q, { quarter: q, totalDemand: 0, totalSupply: 0, areas: {}, demandPoints: 0, supplyPoints: 0 });
      });

      for (const row of filteredRows) {
        const rawQuarter = quarterCol ? row[quarterCol] : undefined;
        if (!rawQuarter) continue;
        const normalizedQuarter = (() => {
          const parsed = parseQuarter(String(rawQuarter));
          return parsed ? formatQuarter(parsed.year, parsed.quarter) : String(rawQuarter);
        })();
        if (!targetSet.has(normalizedQuarter)) continue;
        const holder = template.get(normalizedQuarter);
        if (!holder) continue;
        const areaName = areaCol ? String(row[areaCol] ?? 'Unspecified') || 'Unspecified' : 'All';

        const demandValRaw = demandCol ? num(row[demandCol]) : NaN;
        const supplyValRaw = supplyCol ? num(row[supplyCol]) : NaN;
        const estimateVal = estimateCol ? num(row[estimateCol]) : NaN;
        const stackVal = num(row[areaPerformanceSourceCol]);

        const areaStats = holder.areas[areaName] || { demand: 0, supply: 0 };

        if (Number.isFinite(demandValRaw)) {
          areaStats.demand += Number(demandValRaw);
          holder.totalDemand += Number(demandValRaw);
          holder.demandPoints += 1;
        } else if (!demandCol && Number.isFinite(stackVal)) {
          areaStats.demand += Number(stackVal);
          holder.totalDemand += Number(stackVal);
          holder.demandPoints += 1;
        }

        const supplyFallback = Number.isFinite(supplyValRaw)
          ? Number(supplyValRaw)
          : (!supplyCol && Number.isFinite(estimateVal) ? Number(estimateVal)
            : (!supplyCol && !estimateCol && Number.isFinite(stackVal) ? Number(stackVal) : NaN));
        if (Number.isFinite(supplyFallback)) {
          areaStats.supply += Number(supplyFallback);
          holder.totalSupply += Number(supplyFallback);
          holder.supplyPoints += 1;
        }

        holder.areas[areaName] = areaStats;
      }

      const built = buildFromTemplate(template);
      if (built.some((row) => Object.keys((row as any).__areas || {}).length)) {
        return built;
      }
    }

    if (areaQuarterMatrix.length) {
      const template = new Map<string, PerfBucket>();
      normalized.forEach((q) => {
        template.set(q, { quarter: q, totalDemand: 0, totalSupply: 0, areas: {}, demandPoints: 0, supplyPoints: 0 });
      });
      areaQuarterMatrix.forEach((entry) => {
        const quarterLabel = String((entry as any)?.quarter ?? '');
        if (!targetSet.has(quarterLabel)) return;
        const holder = template.get(quarterLabel);
        if (!holder) return;
        const areaName = String((entry as any)?.area ?? 'Unspecified') || 'Unspecified';
        const demandVal = Number((entry as any)?.demand ?? 0) || 0;
        let supplyVal = Number((entry as any)?.supply ?? 0) || 0;
        const estimateVal = Number((entry as any)?.estimate ?? 0) || 0;
        if (!supplyVal) supplyVal = estimateVal || demandVal;

        const areaStats = holder.areas[areaName] || { demand: 0, supply: 0 };
        if (demandVal) {
          areaStats.demand += demandVal;
          holder.totalDemand += demandVal;
          holder.demandPoints += 1;
        }
        if (supplyVal) {
          areaStats.supply += supplyVal;
          holder.totalSupply += supplyVal;
          holder.supplyPoints += 1;
        }
        holder.areas[areaName] = areaStats;
      });
      return buildFromTemplate(template);
    }

    return [];
  }, [quarterOptions, quarterCol, areaPerformanceSourceCol, filteredRows, areaCol, demandCol, supplyCol, estimateCol, areaQuarterMatrix]);

  const effectiveComparisonAreas = React.useMemo(() => {
    if (comparisonTargetAreas.length) return comparisonTargetAreas;
    return Array.from(new Set(comparisonMatrix.map((row) => row.area)));
  }, [comparisonTargetAreas, comparisonMatrix]);

  const comparisonCards = React.useMemo(() => {
    if (!comparisonMatrix.length) return [] as Array<{
      area: string;
      quarters: string[];
      demandSeries: number[];
      supplySeries: number[];
      estimateSeries: number[];
      latestGap: number;
      latestUtil: number | null;
      trendDelta: number | null;
      demandPeakLabel?: string | null;
    }>;
    const map = new Map<string, { area: string; rows: typeof comparisonMatrix }>();
    comparisonMatrix.forEach((row) => {
      const key = row.area;
      const entry = map.get(key) || { area: key, rows: [] as typeof comparisonMatrix };
      entry.rows.push(row);
      map.set(key, entry);
    });
    const ordered = Array.from(map.values()).map(({ area, rows }) => {
      const sorted = [...rows].sort((a, b) => {
        const ak = parseQuarter(a.quarter)?.key ?? Number.MAX_SAFE_INTEGER;
        const bk = parseQuarter(b.quarter)?.key ?? Number.MAX_SAFE_INTEGER;
        return ak - bk;
      });
      const quarters = sorted.map((row) => row.quarter);
      const demandSeries = sorted.map((row) => row.demand);
      const supplySeries = sorted.map((row) => row.supply);
      const estimateSeries = sorted.map((row) => row.estimate);
      const latest = sorted[sorted.length - 1];
      const latestUtil = latest && latest.demand > 0 ? Number(((latest.supply / latest.demand) * 100).toFixed(1)) : null;
      const firstDemand = demandSeries[0];
      const lastDemand = demandSeries[demandSeries.length - 1];
      const trendDelta = (Number.isFinite(firstDemand) && Number.isFinite(lastDemand) && firstDemand)
        ? Number((((lastDemand - firstDemand) / Math.abs(firstDemand)) * 100).toFixed(1))
        : null;
      let demandPeakLabel: string | null = null;
      if (sorted.length) {
        const peak = sorted.reduce((acc, item) => (item.demand > acc.demand ? item : acc), sorted[0]);
        demandPeakLabel = peak?.quarter ?? null;
      }
      return {
        area,
        quarters,
        demandSeries,
        supplySeries,
        estimateSeries,
        latestGap: latest?.gap ?? 0,
        latestUtil,
        trendDelta,
        demandPeakLabel,
      };
    });
    return ordered;
  }, [comparisonMatrix]);

  const comparisonGraphData = React.useMemo(() => {
    if (!comparisonMatrix.length) return [] as Array<Record<string, number | string>>;
    const areaList = effectiveComparisonAreas;
    const byQuarter = new Map<string, Record<string, number | string>>();
    comparisonMatrix.forEach((row) => {
      if (!areaList.includes(row.area)) return;
      const existing = byQuarter.get(row.quarter) || { quarter: row.quarter };
      existing[`d_${row.area}`] = row.demand;
      existing[`s_${row.area}`] = row.supply;
      byQuarter.set(row.quarter, existing);
    });
    return Array.from(byQuarter.values()).sort((a, b) => {
      const qa = parseQuarter(String(a.quarter))?.key ?? 0;
      const qb = parseQuarter(String(b.quarter))?.key ?? 0;
      return qa - qb;
    });
  }, [comparisonMatrix, effectiveComparisonAreas]);

  const comparisonAreaColors = React.useMemo(() => {
    const map = new Map<string, { demand: string; supply: string }>();
    const list = effectiveComparisonAreas;
    list.forEach((area, idx) => {
      const base = AREA_COLORS[idx % AREA_COLORS.length];
      const supplyColor = AREA_COLORS[(idx + 3) % AREA_COLORS.length];
      map.set(area, { demand: base, supply: supplyColor });
    });
    return map;
  }, [effectiveComparisonAreas]);

  const comparisonLabels = React.useMemo(() => comparisonGraphData.map((row) => String(row.quarter ?? '')), [comparisonGraphData]);
  const comparisonLabelsKey = React.useMemo(() => comparisonLabels.join('|'), [comparisonLabels]);
  const [comparisonBrushWindow, setComparisonBrushWindow] = React.useState<{ start: number; end: number } | null>(null);
  const [comparisonBrushHint, setComparisonBrushHint] = React.useState<string | null>(null);

  const clampComparisonRange = React.useCallback((startRaw: number | undefined, endRaw: number | undefined) => {
    const size = comparisonLabels.length;
    if (size <= 0) return null;
    const start = Math.max(0, Math.min(typeof startRaw === 'number' ? startRaw : 0, size - 1));
    const end = Math.max(start, Math.min(typeof endRaw === 'number' ? endRaw : start, size - 1));
    return { start, end };
  }, [comparisonLabels.length]);

  const applyComparisonBrush = React.useCallback((startRaw?: number, endRaw?: number) => {
    const range = clampComparisonRange(startRaw, endRaw);
    if (!range) {
      setComparisonBrushWindow(null);
      setComparisonBrushHint(null);
      return;
    }
    setComparisonBrushWindow((prev) => {
      if (prev && prev.start === range.start && prev.end === range.end) return prev;
      return range;
    });
    const startLabel = comparisonLabels[range.start] ?? '';
    const endLabel = comparisonLabels[range.end] ?? startLabel;
    setComparisonBrushHint(startLabel && endLabel ? `${startLabel} → ${endLabel}` : startLabel || null);
  }, [clampComparisonRange, comparisonLabels]);

  React.useEffect(() => {
    if (!comparisonLabels.length) {
      setComparisonBrushWindow(null);
      setComparisonBrushHint(null);
      return;
    }
    const size = comparisonLabels.length;
    if (size === 1) {
      applyComparisonBrush(0, 0);
      return;
    }
    const defaultSpan = Math.max(1, Math.min(size - 1, Math.round(size * 0.6)));
    const end = size - 1;
    const start = Math.max(0, end - defaultSpan);
    applyComparisonBrush(start, end);
  }, [comparisonLabelsKey, comparisonLabels.length, applyComparisonBrush]);

  const onComparisonBrushChange = React.useCallback((range: any) => {
    if (!range) return;
    applyComparisonBrush(range.startIndex, range.endIndex);
  }, [applyComparisonBrush]);

  const onComparisonWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!comparisonLabels.length || !comparisonBrushWindow) return;
    const size = comparisonLabels.length;
    if (size <= 1) return;
    const deltaSource = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!deltaSource) return;
    const deltaSign = deltaSource > 0 ? 1 : -1;
    const span = Math.max(1, comparisonBrushWindow.end - comparisonBrushWindow.start);
    if (span >= size) return;
    const shift = deltaSign * Math.max(1, Math.floor(span / 4));
    let start = comparisonBrushWindow.start + shift;
    const maxStart = Math.max(0, size - span - 1);
    start = Math.max(0, Math.min(start, maxStart));
    const end = Math.min(size - 1, start + span);
    applyComparisonBrush(start, end);
    event.preventDefault();
  }, [comparisonLabels.length, comparisonBrushWindow, applyComparisonBrush]);

  const areaPerformanceKeys = React.useMemo(() => {
    if (!recentAreaPerformance.length) return [] as string[];
    const keys = new Set<string>();
    recentAreaPerformance.forEach((row) => {
      Object.entries(row).forEach(([key, value]) => {
        if (key === 'quarter' || key === 'totalDemand' || key === 'totalSupply' || key === '__areas') return;
        if (typeof value === 'number' && Number.isFinite(value)) {
          keys.add(key);
        }
      });
    });
    return Array.from(keys.values()).sort((a, b) => a.localeCompare(b));
  }, [recentAreaPerformance]);

  const areaPerformanceOptions = React.useMemo(() => {
    const unique = new Set<string>(['All']);
    areaOptions.forEach((area) => unique.add(area));
    areaPerformanceKeys.forEach((area) => unique.add(area));
    return Array.from(unique.values());
  }, [areaOptions, areaPerformanceKeys]);

  const [areaPerformanceArea, setAreaPerformanceArea] = React.useState<string>('All');

  React.useEffect(() => {
    if (!areaPerformanceOptions.includes(areaPerformanceArea)) {
      setAreaPerformanceArea('All');
    }
  }, [areaPerformanceOptions, areaPerformanceArea]);

  const areaPerformanceSeries = React.useMemo(() => {
    const map = new Map<string, Array<{ quarter: string; demand: number; supply: number }>>();
    recentAreaPerformance.forEach((row) => {
      const areasEntry = (row as any).__areas as Record<string, { demand: number; supply: number }> | undefined;
      if (!areasEntry) return;
      Object.entries(areasEntry).forEach(([name, stats]) => {
        const arr = map.get(name) || [];
        arr.push({
          quarter: String(row.quarter),
          demand: Number(stats?.demand ?? 0),
          supply: Number(stats?.supply ?? 0),
        });
        map.set(name, arr);
      });
    });
    map.forEach((arr) => arr.sort((a, b) => {
      const qa = parseQuarter(a.quarter)?.key ?? 0;
      const qb = parseQuarter(b.quarter)?.key ?? 0;
      return qa - qb;
    }));
    return map;
  }, [recentAreaPerformance]);

  const selectedAreaSeries = React.useMemo(() => (
    areaPerformanceArea !== 'All' ? areaPerformanceSeries.get(areaPerformanceArea) ?? [] : []
  ), [areaPerformanceArea, areaPerformanceSeries]);

  const selectedAreaCsvRows = React.useMemo(() => (
    selectedAreaSeries.map((row) => ({
      quarter: row.quarter,
      demand: Math.round(row.demand * 100) / 100,
      supply: Math.round(row.supply * 100) / 100,
    }))
  ), [selectedAreaSeries]);

  const areaPerformanceCsvRows = React.useMemo(() => (
    recentAreaPerformance.map((row) => {
      const { __areas, ...rest } = row as any;
      return rest;
    })
  ), [recentAreaPerformance]);

  const areaPerformanceLabels = React.useMemo(() => recentAreaPerformance.map((row) => String(row.quarter ?? '')), [recentAreaPerformance]);
  const areaPerfLabelsKey = React.useMemo(() => areaPerformanceLabels.join('|'), [areaPerformanceLabels]);
  const [areaBrushWindow, setAreaBrushWindow] = React.useState<{ start: number; end: number } | null>(null);
  const [areaBrushHint, setAreaBrushHint] = React.useState<string | null>(null);

  const clampAreaRange = React.useCallback((startRaw: number | undefined, endRaw: number | undefined) => {
    const size = areaPerformanceLabels.length;
    if (size <= 0) return null;
    const start = Math.max(0, Math.min(typeof startRaw === 'number' ? startRaw : 0, size - 1));
    const end = Math.max(start, Math.min(typeof endRaw === 'number' ? endRaw : start, size - 1));
    return { start, end };
  }, [areaPerformanceLabels.length]);

  const applyAreaBrush = React.useCallback((startRaw?: number, endRaw?: number) => {
    const range = clampAreaRange(startRaw, endRaw);
    if (!range) {
      setAreaBrushWindow(null);
      setAreaBrushHint(null);
      return;
    }
    setAreaBrushWindow((prev) => {
      if (prev && prev.start === range.start && prev.end === range.end) return prev;
      return range;
    });
    const startLabel = areaPerformanceLabels[range.start] ?? '';
    const endLabel = areaPerformanceLabels[range.end] ?? startLabel;
    setAreaBrushHint(startLabel && endLabel ? `${startLabel} → ${endLabel}` : startLabel || null);
  }, [clampAreaRange, areaPerformanceLabels]);

  React.useEffect(() => {
    if (!areaPerformanceLabels.length) {
      setAreaBrushWindow(null);
      setAreaBrushHint(null);
      return;
    }
    const size = areaPerformanceLabels.length;
    if (size === 1) {
      applyAreaBrush(0, 0);
      return;
    }
    const defaultSpan = Math.max(1, Math.min(size - 1, Math.round(size * 0.6)));
    const end = size - 1;
    const start = Math.max(0, end - defaultSpan);
    applyAreaBrush(start, end);
  }, [areaPerfLabelsKey, areaPerformanceLabels.length, applyAreaBrush]);

  const onAreaBrushChange = React.useCallback((range: any) => {
    if (!range) return;
    applyAreaBrush(range.startIndex, range.endIndex);
  }, [applyAreaBrush]);

  const onAreaWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!areaPerformanceLabels.length || !areaBrushWindow) return;
    const size = areaPerformanceLabels.length;
    if (size <= 1) return;
    const deltaSource = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!deltaSource) return;
    const deltaSign = deltaSource > 0 ? 1 : -1;
    const span = Math.max(1, areaBrushWindow.end - areaBrushWindow.start);
    if (span >= size) return;
    const shift = deltaSign * Math.max(1, Math.floor(span / 4));
    let start = areaBrushWindow.start + shift;
    const maxStart = Math.max(0, size - span - 1);
    start = Math.max(0, Math.min(start, maxStart));
    const end = Math.min(size - 1, start + span);
    applyAreaBrush(start, end);
    event.preventDefault();
  }, [areaPerformanceLabels.length, areaBrushWindow, applyAreaBrush]);

  const openReasonModal = React.useCallback((entry: { project?: string | null; trial?: string | null; area?: string | null }) => {
    const key = `${entry.project ?? ''}__${entry.trial ?? ''}__${entry.area ?? ''}`;
    setReasonTarget({ key, ...entry });
    setReasonDraft((estimateReasons[key] ?? '').toString());
  }, [estimateReasons]);

  const closeReasonModal = React.useCallback(() => {
    setReasonTarget(null);
    setReasonDraft('');
  }, []);

  const saveReason = React.useCallback(() => {
    if (!reasonTarget) return;
    const trimmed = reasonDraft.trim();
    setEstimateReasons((prev) => ({ ...prev, [reasonTarget.key]: trimmed }));
    closeReasonModal();
  }, [reasonTarget, reasonDraft, closeReasonModal]);

  const normalizeQuarterSelection = React.useCallback((arr: string[]) => {
    const unique: string[] = [];
    arr.forEach((q) => {
      if (!quarterOptions.includes(q)) return;
      if (unique.includes(q)) return;
      unique.push(q);
    });
    return unique.slice(-5);
  }, [quarterOptions]);

  const normalizeAreaSelection = React.useCallback((arr: string[]) => {
    const unique: string[] = [];
    arr.forEach((area) => {
      if (!areaOptions.includes(area)) return;
      if (unique.includes(area)) return;
      if (unique.length >= 5) return;
      unique.push(area);
    });
    if (!unique.length && areaOptions.length) unique.push(areaOptions[0]);
    return unique;
  }, [areaOptions]);

  const toggleQuarterDraft = React.useCallback((label: string) => {
    setQuarterDraft((prev) => {
      if (prev.includes(label)) return prev.filter((q) => q !== label);
      const next = [...prev, label];
      return normalizeQuarterSelection(next);
    });
  }, [normalizeQuarterSelection]);

  const toggleAreaDraft = React.useCallback((area: string) => {
    setAreaDraft((prev) => {
      if (prev.includes(area)) {
        const next = prev.filter((a) => a !== area);
        return normalizeAreaSelection(next);
      }
      const next = [...prev, area];
      return normalizeAreaSelection(next);
    });
  }, [normalizeAreaSelection]);

  const applyComparison = React.useCallback(() => {
    const normalizedQuarters = normalizeQuarterSelection(quarterDraft);
    const normalizedAreas = normalizeAreaSelection(areaDraft);
    setSelectedQuarters(normalizedQuarters);
    setComparisonAreas(normalizedAreas);
  }, [quarterDraft, areaDraft, normalizeQuarterSelection, normalizeAreaSelection]);

  const canCompare = React.useMemo(() => {
    return normalizeQuarterSelection(quarterDraft).length > 0 && normalizeAreaSelection(areaDraft).length > 0;
  }, [quarterDraft, areaDraft, normalizeQuarterSelection, normalizeAreaSelection]);

  const hasPendingComparisonChanges = React.useMemo(() => {
    const draftQ = normalizeQuarterSelection(quarterDraft);
    const appliedQ = normalizeQuarterSelection(selectedQuarters);
    const draftA = normalizeAreaSelection(areaDraft);
    const appliedA = normalizeAreaSelection(comparisonAreas);
    const quartersChanged = draftQ.length !== appliedQ.length || draftQ.some((q, idx) => q !== appliedQ[idx]);
    const areasChanged = draftA.length !== appliedA.length || draftA.some((a, idx) => a !== appliedA[idx]);
    return quartersChanged || areasChanged;
  }, [quarterDraft, selectedQuarters, areaDraft, comparisonAreas, normalizeQuarterSelection, normalizeAreaSelection]);

  const projects = data.metrics?.projects ?? (projectCol ? uniq(filteredRows.map((r) => r[projectCol as string])) : undefined);
  const areas = data.metrics?.areas ?? (areaCol ? uniq(filteredRows.map((r) => r[areaCol as string])) : undefined);

  const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

  const sumFrom = (rowsList: typeof filteredRows, col?: string) => (col ? rowsList.reduce((acc, r) => acc + (Number.isFinite(num(r[col])) ? num(r[col]) : 0), 0) : undefined);
  const totalDemand = (data.metrics?.total_demand ?? undefined) ?? sumFrom(filteredRows, demandCol);
  const totalSupply = (data.metrics?.total_supply ?? undefined) ?? sumFrom(filteredRows, supplyCol);

  // Use only actual totals; no synthetic fallback here

  const parseDate = (v: unknown): number | undefined => {
    if (!v) return undefined;
    // Try ISO-like strings.
    const d = new Date(String(v));
    return isNaN(d.valueOf()) ? undefined : d.valueOf();
  };
  const minDate = (col?: string) => (col ? rows.map((r) => parseDate(r[col])).filter(Boolean) as number[] : []).sort((a,b)=>a-b)[0];
  const maxDate = (col?: string) => (col ? rows.map((r) => parseDate(r[col])).filter(Boolean) as number[] : []).sort((a,b)=>b-a)[0];
  const earliest = minDate(startCol);
  const latest = maxDate(endCol);

  const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");
  // Bottlenecks: count rows where supply < demand when both numeric exist
  const bottlenecks = (() => {
    if (!demandCol || !supplyCol) return undefined;
    let c = 0;
    for (const r of filteredRows) {
      const d = num(r[demandCol]);
      const s = num(r[supplyCol]);
      if (Number.isFinite(d) && Number.isFinite(s) && s < d) c++;
    }
    return c;
  })();
  const bottlenecksServer = Array.isArray(data.bottlenecks) ? data.bottlenecks.length : undefined;
  const topGapDetails = React.useMemo(() => {
    if (!Array.isArray(data.bottlenecks)) return [] as NonNullable<typeof data.bottlenecks>;
    return [...data.bottlenecks].sort((a, b) => (b.gap || 0) - (a.gap || 0)).slice(0, 5);
  }, [data.bottlenecks]);

  const topGapsFromServer = topGapDetails.map((b) => ({
    name: String(b.project || b.trial || b.area || ''),
    value: Math.round((b.gap || 0) * 100) / 100,
  }));

  // Forecast series (slice if a specific quarter selected)
  // Base series from upload or derived metrics
  const baseLabels = data.timeseries?.labels ?? [];
  const baseEst = data.timeseries?.estimate ?? [];
  const baseDem = data.timeseries?.demand ?? [];
  const baseSup = data.timeseries?.supply ?? [];
  // Optional forecast from backend (derived preferred), or from initial upload 'ml'
  const f = (data as any)?.timeseries?.forecast as any;
  const fml = (data as any)?.ml as any;
  const forecastLabels: string[] = f?.labels || fml?.labels || [];
  const forecastValues: number[] = f?.values || fml?.forecast || [];
  const forecastLower: number[] | undefined = f?.ci?.lower || fml?.ci?.lower;
  const forecastUpper: number[] | undefined = f?.ci?.upper || fml?.ci?.upper;
  const allLabels = [...baseLabels, ...forecastLabels];
  const allEst = [...baseEst, ...new Array(forecastLabels.length).fill(null as any)];
  const allDem = [...baseDem, ...forecastValues];
  const allSup = [...baseSup, ...new Array(forecastLabels.length).fill(null as any)];
  // Keep only a dynamic 2-year window from the current quarter forward
  const parseQ = (q: string): { y: number; q: number; key: number } | null => {
    // Accept 'Q1 2026', '2026 Q1', '2026Q1', '2026-Q1'
    const m = q.match(/(?:Q\s*(\d)\s*[\-/\s]*([12]\d{3})|([12]\d{3})\s*[\-/\s]*Q\s*(\d)|([12]\d{3})\s*Q\s*(\d))/i);
    let yr: number | undefined, qu: number | undefined;
    if (m) {
      yr = Number(m[2] || m[3] || m[5]);
      qu = Number(m[1] || m[4] || m[6]);
    }
    if (!yr || !qu) {
      const mm = q.match(/Q\s*(\d)\s*(\d{4})/i) || q.match(/(\d{4})\s*Q\s*(\d)/i);
      if (mm) { yr = Number(mm[2] || mm[1]); qu = Number(mm[1] || mm[2]); }
    }
    if (!yr || !qu) return null;
    const key = yr * 4 + (qu - 1);
    return { y: yr, q: qu, key };
  };
  const now = new Date();
  const currQ = Math.floor(now.getMonth() / 3) + 1;
  const currKey = now.getFullYear() * 4 + (currQ - 1);
  // Base window end is current + 2y; but ensure all forecast quarters are included
  const forecastMaxKey = forecastLabels.length ? (forecastLabels.map(l => parseQ(String(l))?.key || currKey).reduce((a,b)=> Math.max(a,b), currKey)) : currKey;
  const endKey = Math.max(currKey + 8 - 1, forecastMaxKey); // include forecasts even beyond 2y
  const windowed = allLabels
    .map((l, i) => ({ l, e: allEst[i], d: allDem[i], s: allSup[i], p: parseQ(String(l)) }))
    .filter(x => x.p && x.p.key >= currKey && x.p.key <= endKey)
    .sort((a,b) => (a.p!.key - b.p!.key));
  const wLabels = windowed.map(x => x.l);
  const wEst = windowed.map(x => x.e ?? 0);
  const wDem = windowed.map(x => x.d ?? 0);
  const wSup = windowed.map(x => x.s ?? 0);
  const combinedSeriesData = React.useMemo(() => wLabels.map((label, idx) => ({
    name: label,
    estimate: wEst[idx] ?? 0,
    demand: wDem[idx] ?? 0,
  })), [wLabels, wEst, wDem]);
  const idx = filters.quarter ? wLabels.findIndex((l)=>l===filters.quarter) : -1;
  const months = idx >= 0 ? [wLabels[idx]] : (wLabels.length ? wLabels : ["Q1 2025","Q2 2025"]);
  const seriesActual = idx >= 0 ? [wEst[idx]] : (wEst.length ? wEst : months.map((_,i)=>100+i*5));
  const seriesForecast = idx >= 0 ? [wDem[idx]] : (wDem.length ? wDem : months.map((_,i)=>110+i*6));
  const seriesPredict = idx >= 0 ? [wSup[idx]] : (wSup.length ? wSup : months.map((_,i)=>115+i*6));

  const totalDemandFromQuarter = idx >= 0 && allDem.length ? allDem[idx] : undefined;
  const totalSupplyFromQuarter = idx >= 0 && allSup.length ? allSup[idx] : undefined;
  const totalDemandSeries = allDem.length ? allDem.reduce((a,b)=> a + (Number.isFinite(b) ? b : 0), 0) : undefined;
  const totalSupplySeries = allSup.length ? allSup.reduce((a,b)=> a + (Number.isFinite(b) ? b : 0), 0) : undefined;
  const totalDemandShown = totalDemandFromQuarter ?? (totalDemand as number | undefined) ?? totalDemandSeries;
  const totalSupplyShown = totalSupplyFromQuarter ?? (totalSupply as number | undefined) ?? totalSupplySeries;

  // Health badges
  const utilPct = (isFiniteNumber(totalSupplyShown) && isFiniteNumber(totalDemandShown) && (totalDemandShown as number) > 0)
    ? (100 * (totalSupplyShown as number) / (totalDemandShown as number))
    : (isFiniteNumber(data.metrics?.utilization_rate) ? (data.metrics!.utilization_rate as number) : undefined);
  const utilBadge = (() => {
    if (!isFiniteNumber(utilPct)) return { label: 'n/a', tone: '' };
    if (utilPct >= 85 && utilPct <= 100) return { label: 'good', tone: 'badge-green' };
    if (utilPct >= 70 && utilPct < 85) return { label: 'fair', tone: 'badge-amber' };
    return { label: 'risk', tone: 'badge-red' };
  })();
  const dsDelta = isFiniteNumber(totalSupplyShown) && isFiniteNumber(totalDemandShown)
    ? (totalSupplyShown as number) - (totalDemandShown as number)
    : undefined;
  const dsBadge = (() => {
    if (!isFiniteNumber(dsDelta)) return { label: 'n/a', tone: '' };
    if (dsDelta >= 0) return { label: '+ OK', tone: 'badge-green' };
    if (dsDelta > -5) return { label: 'slight gap', tone: 'badge-amber' };
    return { label: 'gap', tone: 'badge-red' };
  })();

  const demandAnimated = useCountUp(isFiniteNumber(totalDemandShown) ? (totalDemandShown as number) : undefined);
  const supplyAnimated = useCountUp(isFiniteNumber(totalSupplyShown) ? (totalSupplyShown as number) : undefined);
  const utilAnimated = useCountUp(isFiniteNumber(utilPct) ? utilPct : undefined, 1, 1000);

  // Aggregate quick highlights (top projects by demand)
  const topProjectsByDemand: Array<{ name: string; total: number }> = React.useMemo(() => {
    if (!projectCol || !demandCol) return [];
    const m = new Map<string, number>();
    for (const r of filteredRows) {
      const p = String(r[projectCol] ?? '');
      const d = num(r[demandCol]);
      if (Number.isFinite(d)) m.set(p, (m.get(p) || 0) + d);
    }
    return Array.from(m.entries()).map(([name, total]) => ({ name, total })).sort((a,b)=>b.total-a.total).slice(0,3);
  }, [projectCol, demandCol, filteredRows]);

  const highlightPlaceholder = React.useMemo(() => ({
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'Demand', color: '#22c55e', data: [12, 15, 14, 18] },
      { name: 'Supply', color: '#60a5fa', data: [11, 14, 13, 17] },
    ],
  }), []);

  // Flash indicator when model retrains
  const [flashForecast, setFlashForecast] = React.useState(false);
  React.useEffect(() => {
    const onModel = () => {
      setFlashForecast(true);
      const id = setTimeout(()=> setFlashForecast(false), 2500);
      return () => clearTimeout(id);
    };
    window.addEventListener('model-trained', onModel as any);
    return () => window.removeEventListener('model-trained', onModel as any);
  }, []);

  return (
    <>
      {reasonTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', display: 'grid', placeItems: 'center', zIndex: 30 }}>
          <div className="card" style={{ width: 'min(480px, 90vw)' }}>
            <div className="card-header">Add reason for missing estimate</div>
            <div className="card-body" style={{ display: 'grid', gap: 14 }}>
              <div className="muted">
                {reasonTarget.project && <div>Project: <strong>{reasonTarget.project}</strong></div>}
                {reasonTarget.trial && <div>Trial: <strong>{reasonTarget.trial}</strong></div>}
                {reasonTarget.area && <div>Area: <strong>{reasonTarget.area}</strong></div>}
                {!reasonTarget.project && !reasonTarget.trial && !reasonTarget.area && <div>No additional context for this entry.</div>}
              </div>
              <textarea
                className="textarea"
                placeholder="Capture why the estimate is missing or zero…"
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                rows={4}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-ghost" onClick={closeReasonModal}>Cancel</button>
                <button className="btn btn-primary" onClick={saveReason} disabled={!reasonDraft.trim()}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <section className="grid" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-body" style={{ display: 'grid', gap: 12 }}>
            <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>Dataset snapshot</div>
            <div className="chips">
              <span className="chip">Rows: {data.row_count ?? rows.length}</span>
              {projects !== undefined && <span className="chip">Projects: {projects}</span>}
              {areas !== undefined && <span className="chip">Areas: {areas}</span>}
              <span className="chip">Earliest start: {fmtDate(earliest)}</span>
              <span className="chip">Latest end: {fmtDate(latest)}</span>
            </div>
            {(demandCol || supplyCol) && (
              <div className="chips">
                <span className="chip">Demand Σ: {isFiniteNumber(totalDemandShown) ? Math.round(totalDemandShown as number).toLocaleString() : '—'}</span>
                <span className="chip">Supply Σ: {isFiniteNumber(totalSupplyShown) ? Math.round(totalSupplyShown as number).toLocaleString() : '—'}</span>
                {isFiniteNumber(dsDelta) && <span className="chip">Gap: {Math.round((dsDelta as number) * 100) / 100}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="kpi-grid">
          <div className="card kpi-card" title="Total demand across the visible time range (FTE units)">
            <div className="card-header">Total Demand</div>
            <div className="card-body kpi-body">
              <div className="kpi-value kpi-enter">
                {isFiniteNumber(totalDemandShown) && demandAnimated !== undefined ? Math.round(demandAnimated).toLocaleString() : '—'}
                <span className="kpi-suffix">FTE</span>
              </div>
              <span className={`chip ${dsBadge.tone}`.trim()}>{dsBadge.label}</span>
            </div>
          </div>
          <div className="card kpi-card" title="Total supply delivered in the same horizon">
            <div className="card-header">Total Supply</div>
            <div className="card-body kpi-body">
              <div className="kpi-value kpi-enter">
                {isFiniteNumber(totalSupplyShown) && supplyAnimated !== undefined ? Math.round(supplyAnimated).toLocaleString() : '—'}
                <span className="kpi-suffix">FTE</span>
              </div>
              <span className={`chip ${dsBadge.tone}`.trim()}>{dsBadge.label}</span>
            </div>
          </div>
          <div className="card kpi-card" title="Supply divided by demand. 85-100% is healthy, 70-85% watch, below 70% risk.">
            <div className="card-header">Utilization Rate</div>
            <div className="card-body kpi-body">
              <div className="kpi-value kpi-enter">
                {isFiniteNumber(utilPct) && utilAnimated !== undefined ? utilAnimated.toFixed(1) : '—'}
                <span className="kpi-suffix">%</span>
              </div>
              <span className={`chip ${utilBadge.tone}`.trim()}>{utilBadge.label}</span>
            </div>
          </div>
          <div className="card kpi-card" title="Number of quarters where demand exceeds supply">
            <div className="card-header">Critical Bottlenecks</div>
            <div className="card-body kpi-body">
              <div className="kpi-value kpi-enter">{bottlenecksServer ?? bottlenecks ?? '—'}</div>
              <span className={`chip ${(bottlenecksServer ?? bottlenecks ?? 0) > 0 ? 'badge-red' : 'badge-green'}`.trim()}>
                {(bottlenecksServer ?? bottlenecks ?? 0) > 0 ? 'at risk' : 'all clear'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid two">
          <div className="card">
            <div className="card-header">Highlights</div>
            <div className="card-body" style={{ display: 'grid', gap: 12 }}>
              {topProjectsByDemand.length ? (
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Top projects by demand</div>
                  <div className="chips">
                    {topProjectsByDemand.map((p) => (
                      <span key={p.name} className="chip">{p.name}: {Math.round(p.total).toLocaleString()}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600 }}>Demand vs supply trajectory</div>
                  <div className="muted" style={{ marginTop: 4 }}>Insights load once demand data syncs.</div>
                  <div className="highlights-chart">
                    <ChartLine labels={highlightPlaceholder.labels} series={highlightPlaceholder.series} height={120} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Quarter & Area Comparison</div>
          <div className="card-body" style={{ display: 'grid', gap: 16 }}>
            <div className="comparison-selector">
              <div style={{ minWidth: 200 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>Quarters (max 5)</div>
                <div className="chip-grid" style={{ marginTop: 6 }}>
                  {quarterOptions.map((quarter) => {
                    const active = quarterDraft.includes(quarter);
                    const disabled = !active && quarterDraft.length >= 5;
                    return (
                      <button
                        key={quarter}
                        className={`select-pill ${active ? 'is-active' : ''}`}
                        disabled={disabled}
                        onClick={() => toggleQuarterDraft(quarter)}
                        title={disabled ? 'Max 5 selections allowed' : active ? 'Selected' : 'Click to select'}
                      >
                        {active && <span className="select-pill-check" aria-hidden="true">✓</span>}
                        {quarter}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ minWidth: 200 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>Areas (max 5)</div>
                <div className="chip-grid" style={{ marginTop: 6 }}>
                  {areaOptions.map((area) => {
                    const active = areaDraft.includes(area);
                    const disabled = !active && areaDraft.length >= 5;
                    return (
                      <button
                        key={area}
                        className={`select-pill ${active ? 'is-active' : ''}`}
                        disabled={disabled}
                        onClick={() => toggleAreaDraft(area)}
                        title={disabled ? 'Max 5 selections allowed' : active ? 'Selected' : 'Click to select'}
                      >
                        {active && <span className="select-pill-check" aria-hidden="true">✓</span>}
                        {area}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className="btn btn-primary"
                  onClick={applyComparison}
                  disabled={!canCompare || !hasPendingComparisonChanges}
                  title={!canCompare ? 'Select at least one quarter and area' : (hasPendingComparisonChanges ? 'Apply comparison selection' : 'Selections already applied')}
                >
                  Compare
                </button>
              </div>
            </div>
            {comparisonCards.length ? (
              <>
                <div className="comparison-stat-bar">
                  {comparisonCards.map((card) => (
                    <div key={`summary-${card.area}`} className="comparison-pill">
                      <div className="pill-label">{card.area}</div>
                      <div className="pill-value">{card.latestUtil != null ? `${card.latestUtil.toFixed(1)}% util` : '—'}</div>
                      <div className={card.trendDelta != null && card.trendDelta >= 0 ? 'pill-trend bad' : 'pill-trend good'}>
                        {card.trendDelta != null ? `${card.trendDelta >= 0 ? '+' : ''}${card.trendDelta.toFixed(1)}% trend` : 'n/a'}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="comparison-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                  {comparisonCards.map((card) => (
                    <div className="comparison-card" key={`comparison-${card.area}`}>
                      <div className="comparison-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: 16 }}>{card.area}</h4>
                          <div className="muted" style={{ fontSize: 12 }}>{card.quarters[0] ?? 'n/a'} → {card.quarters[card.quarters.length - 1] ?? 'n/a'}</div>
                        </div>
                        <div className="comparison-badge" data-tone={card.trendDelta != null && card.trendDelta >= 0 ? 'warn' : 'good'}>
                          {card.trendDelta != null ? `${card.trendDelta >= 0 ? '+' : ''}${card.trendDelta.toFixed(1)}%` : '—'}
                        </div>
                      </div>
                      <div className="sparkline-wrap" style={{ marginTop: 12 }}>
                        <ForecastChart
                          labels={card.quarters}
                          estimate={card.estimateSeries}
                          demand={card.demandSeries}
                          supply={card.supplySeries}
                          height={160}
                          animate={false}
                          highlightGap="demand-supply"
                          useBrush={false}
                        />
                      </div>
                      <div className="comparison-meta">
                        <div>
                          <span className="meta-label">Gap</span>
                          <span className={card.latestGap > 0 ? 'meta-value bad' : 'meta-value good'}>{Number(card.latestGap).toFixed(1)}</span>
                        </div>
                        <div>
                          <span className="meta-label">Util</span>
                          <span className="meta-value">{card.latestUtil != null ? `${card.latestUtil.toFixed(1)}%` : '—'}</span>
                        </div>
                        <div>
                          <span className="meta-label">Peak demand</span>
                          <span className="meta-value">{card.demandPeakLabel ?? '—'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {comparisonCards.length > 0 && comparisonGraphData.length > 0 && (
                  <div className="card" style={{ marginTop: 16 }}>
                    <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Quarter comparison chart</span>
                      <ChartActions filename="quarter-area-comparison" csvRows={comparisonGraphData as any[]} />
                    </div>
                    <div className="card-body" style={{ height: 320, position: 'relative' }}>
                      <div onWheel={onComparisonWheel} style={{ width: '100%', height: '100%' }}>
                      <ResponsiveContainer>
                        <ComposedChart data={comparisonGraphData} margin={{ top: 16, right: 32, left: 58, bottom: 24 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                          <XAxis
                            dataKey="quarter"
                            tick={{ fill: 'var(--muted)', fontSize: 12 }}
                            minTickGap={12}
                            tickMargin={14}
                            height={58}
                            angle={45}
                            textAnchor="end"
                            tickLine={false}
                            axisLine={{ stroke: 'var(--border)' }}
                          />
                          <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} width={60} tickMargin={10} allowDecimals={false} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                          <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
                          <Legend wrapperStyle={{ color: 'var(--muted)', fontSize: 12, paddingTop: 8 }} />
                          {effectiveComparisonAreas.map((area) => {
                            const palette = comparisonAreaColors.get(area) || { demand: '#22c55e', supply: '#60a5fa' };
                            return (
                              <React.Fragment key={`graph-${area}`}>
                                <Line type="monotone" dataKey={`d_${area}`} name={`${area} Demand`} stroke={palette.demand} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey={`s_${area}`} name={`${area} Supply`} stroke={palette.supply} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                              </React.Fragment>
                            );
                          })}
                          <Brush
                            dataKey="quarter"
                            travellerWidth={14}
                            height={32}
                            stroke="var(--primary)"
                            fill="rgba(56,189,248,0.12)"
                            startIndex={comparisonBrushWindow?.start}
                            endIndex={comparisonBrushWindow?.end}
                            onChange={onComparisonBrushChange}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                      {comparisonBrushHint && <div className="brush-hint">{comparisonBrushHint}</div>}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="muted">Select quarters and areas to compare KPIs.</div>
            )}
            {comparisonMatrix.length ? (
              <div className="scroll-area" style={{ maxHeight: 260 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Quarter</th>
                      <th>Area</th>
                      <th>Estimate Σ</th>
                      <th>Demand Σ</th>
                      <th>Supply Σ</th>
                      <th>Gap</th>
                      <th>Utilization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonMatrix.map((row, idx) => (
                      <tr key={`${row.quarter}-${row.area}-${idx}`}>
                        <td>{row.quarter}</td>
                        <td>{row.area}</td>
                        <td>{Math.round(row.estimate * 100) / 100}</td>
                        <td>{Math.round(row.demand * 100) / 100}</td>
                        <td>{Math.round(row.supply * 100) / 100}</td>
                        <td style={{ color: row.gap > 0 ? '#ef4444' : 'var(--text)' }}>{Math.round(row.gap * 100) / 100}</td>
                        <td>{row.utilization != null ? `${row.utilization}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid two">
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Top gaps (projects)</span>
              {topGapsFromServer.length > 0 && <span className="muted" style={{ fontSize: 12 }}>Click a bar to highlight impacted areas</span>}
            </div>
            <div className="card-body">
              {topGapsFromServer.length ? (
                <MiniBarChart
                  items={topGapsFromServer}
                  height={160}
                  onSelect={(item) => setHighlightedGapProject((prev) => prev === item.name ? null : item.name)}
                />
              ) : (
                <div className="muted">No bottleneck data available.</div>
              )}
            </div>
          </div>
          <div className="card" ref={bottlenecksRef as any}>
            <div className="card-header">Critical Bottlenecks (Top 5)</div>
            <div className="card-body" style={{ display: 'grid', gap: 10 }}>
              {topGapDetails.length ? topGapDetails.map((b, idx) => {
                const key = `${b.project ?? ''}__${b.trial ?? ''}__${b.area ?? ''}`;
                const active = highlightedGapProject === String(b.project || b.trial || b.area || '');
                const reason = estimateReasons[key];
                const estZero = !Number.isFinite(b.estimate_total) || b.estimate_total <= 0;
                return (
                  <div
                    key={idx}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 10,
                      background: active ? 'rgba(249,115,22,0.12)' : 'var(--surface-2)',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{b.project || b.trial || b.area || 'Unnamed'}</strong>
                      <span style={{ color: b.gap > 0 ? '#ef4444' : 'var(--muted)', fontWeight: 600 }}>Gap {Math.round((b.gap || 0) * 100) / 100}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Area: {b.area || '—'} • Demand Σ {Math.round((b.demand_total || 0) * 100) / 100} • Estimate Σ {Math.round((b.estimate_total || 0) * 100) / 100}
                    </div>
                    {estZero ? (
                      <button className="btn btn-ghost" onClick={() => openReasonModal({ project: b.project, trial: b.trial, area: b.area })}>
                        {reason ? 'Edit reason' : 'Add reason'}
                      </button>
                    ) : reason ? (
                      <div className="muted" style={{ fontSize: 12 }}>Reason: {reason}</div>
                    ) : null}
                  </div>
                );
              }) : (
                <div className="muted">No critical gaps detected.</div>
              )}
              {Array.isArray(data.bottlenecks) && data.bottlenecks.length > 5 && (
                <details style={{ marginTop: 4 }}>
                  <summary className="muted" style={{ cursor: 'pointer' }}>View full bottleneck table</summary>
                  <div className="scroll-area" style={{ maxHeight: 200, marginTop: 8 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Project</th>
                          <th>Trial</th>
                          <th>Area</th>
                          <th>Demand Σ</th>
                          <th>Estimate Σ</th>
                          <th>Gap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.bottlenecks.map((b, i) => (
                          <tr key={`full-${i}`}>
                            <td>{b.project ?? ''}</td>
                            <td>{b.trial ?? ''}</td>
                            <td>{b.area ?? ''}</td>
                            <td>{Math.round((b.demand_total || 0) * 100) / 100}</td>
                            <td>{Math.round((b.estimate_total || 0) * 100) / 100}</td>
                            <td style={{ color: b.gap > 5 ? '#ef4444' : 'var(--text)' }}>{Math.round((b.gap || 0) * 100) / 100}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>

        <div className="grid two">
          <div className="card">
            <div className="card-header">Demand share by Area</div>
            <div className="card-body" style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AreaDonut
                areaCol={areaCol}
                demandCol={demandCol}
                supplyCol={supplyCol}
                estimateCol={estimateCol}
                rows={filteredRows}
                totals={areaTotals}
                highlight={highlightedGapAreas}
              />
            </div>
          </div>
          <div className="card">
            <div className="card-header">Area utilization map</div>
            <div className="card-body" style={{ minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AreaHeatmap areaCol={areaCol} demandCol={demandCol} supplyCol={supplyCol} estimateCol={estimateCol} rows={filteredRows} totals={areaTotals} highlight={highlightedGapAreas} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>Area performance (last 5 quarters)</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {areaPerformanceOptions.map((option) => (
                <button
                  key={option}
                  className={`btn ${areaPerformanceArea === option ? 'btn-secondary' : 'btn-ghost'}`}
                  onClick={() => setAreaPerformanceArea(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
            <div className="card-body area-performance" style={{ height: 360, position: 'relative' }}>
            {recentAreaPerformance.length === 0 ? (
              <div className="muted">Need quarter and area data to plot performance.</div>
            ) : areaPerformanceArea !== 'All' ? (
              selectedAreaSeries.length ? (
                <>
                  <ChartActions
                    filename={`area-performance-${areaPerformanceArea.toLowerCase()}`}
                    csvRows={selectedAreaCsvRows}
                  />
                  <ChartActions filename={`area-performance-${areaPerformanceArea.toLowerCase()}`} csvRows={selectedAreaCsvRows} />
                  <ChartLine
                    labels={selectedAreaSeries.map((row) => row.quarter)}
                    series={[
                      { name: 'Demand', color: '#f97316', data: selectedAreaSeries.map((row) => row.demand) },
                      { name: 'Supply', color: '#22c55e', data: selectedAreaSeries.map((row) => row.supply) },
                    ]}
                    height={280}
                  />
                </>
              ) : (
                <div className="muted">No data for {areaPerformanceArea}.</div>
              )
            ) : (
              <>
                <ChartActions filename="area-performance" csvRows={areaPerformanceCsvRows} />
                <div onWheel={onAreaWheel} style={{ width: '100%', height: '100%' }}>
                <ResponsiveContainer>
                    <ComposedChart data={recentAreaPerformance} margin={{ top: 24, right: 32, left: 60, bottom: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                      <XAxis
                        dataKey="quarter"
                        tick={{ fill: 'var(--muted)', fontSize: 12 }}
                        minTickGap={12}
                        tickMargin={14}
                        height={58}
                        angle={45}
                        textAnchor="end"
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                      />
                    <YAxis
                      tick={{ fill: 'var(--muted)', fontSize: 12 }}
                      width={60}
                      tickMargin={10}
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                    />
                    <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
                    <Legend wrapperStyle={{ color: 'var(--muted)', fontSize: 12, paddingTop: 10 }} />
                    {areaPerformanceKeys.map((key, idx) => (
                      <Bar key={key} dataKey={key} stackId="areas" fill={AREA_COLORS[idx % AREA_COLORS.length]} radius={[6, 6, 0, 0]} />
                    ))}
                    <Line type="monotone" dataKey="totalDemand" name="Demand total" stroke="#f97316" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="totalSupply" name="Supply total" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Brush
                      dataKey="quarter"
                      travellerWidth={14}
                      height={32}
                      stroke="var(--primary)"
                      fill="rgba(56,189,248,0.12)"
                      startIndex={areaBrushWindow?.start}
                      endIndex={areaBrushWindow?.end}
                      onChange={onAreaBrushChange}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                </div>
                {areaBrushHint && <div className="brush-hint">{areaBrushHint}</div>}
              </>
            )}
          </div>
        </div>

        <div className={`card ${flashForecast ? 'flash-ring' : ''}`}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Forecast vs Actual</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { key: 'stacked', label: 'Stacked' },
                { key: 'line', label: 'Line' },
                { key: 'bar', label: 'Bar' },
              ] as const).map((mode) => (
                <button
                  key={mode.key}
                  className={`btn ${forecastView === mode.key ? 'btn-secondary' : 'btn-ghost'}`}
                  onClick={() => setForecastView(mode.key)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="card-body">
            {wLabels.length ? (
              forecastView === 'stacked' ? (
                <>
                  <ChartActions filename="forecast-vs-actual" csvRows={combinedSeriesData} />
                  <StackedBars labels={wLabels} a={wEst} b={wDem} names={{ a: 'Estimate', b: 'Demand' }} height={420} showActions={false} />
                </>
              ) : forecastView === 'line' ? (
                <>
                  <ChartActions filename="forecast-vs-actual" csvRows={combinedSeriesData} />
                  <ChartLine
                    labels={wLabels}
                    series={[
                      { name: 'Estimate', color: '#60a5fa', data: wEst },
                      { name: 'Demand', color: '#22c55e', data: wDem },
                    ]}
                    height={320}
                  />
                </>
              ) : (
                <div style={{ width: '100%', height: 320 }}>
                  <ChartActions filename="forecast-vs-actual" csvRows={combinedSeriesData} />
                  <StackedBars labels={wLabels} a={wEst} b={wDem} names={{ a: 'Estimate', b: 'Demand' }} height={320} showActions={false} />
                </div>
              )
            ) : (
              <div className="muted">No quarter series available.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>FTE Forecast with Confidence Bands</span>
            <span className="muted" style={{ fontSize: 12 }}>Auto-refreshes when the model retrains</span>
          </div>
          <div className="card-body">
            <ForecastChart
              labels={months}
              estimate={seriesActual}
              demand={seriesForecast}
              supply={seriesPredict}
              band={(forecastLower && forecastUpper && months.length === (seriesForecast.length)) ? { lower: [...new Array(baseLabels.length).fill(null as any), ...forecastLower].slice(-months.length), upper: [...new Array(baseLabels.length).fill(null as any), ...forecastUpper].slice(-months.length) } : (data.timeseries && data.timeseries.ci ? { lower: data.timeseries.ci.lower, upper: data.timeseries.ci.upper } : undefined)}
              height={380}
              highlightGap="demand-supply"
            />
          </div>
        </div>
      </section>
    </>
  );
};

export default Dashboard;

// --- Inline helpers for visual components that depend on Dashboard's data-shape
type AreaAggProps = {
  areaCol?: string;
  demandCol?: string;
  supplyCol?: string;
  estimateCol?: string;
  rows: Array<Record<string, any>>;
  totals?: Array<{ area: string; demand: number; supply: number; estimate: number }>;
  highlight?: Set<string>;
};

const AreaDonut: React.FC<AreaAggProps> = ({ areaCol, demandCol, supplyCol, estimateCol, rows, totals, highlight }) => {
  let dummy = false;
  if (!areaCol) dummy = true;
  const sum = (v: any) => (typeof v === 'number' && Number.isFinite(v)) ? v : (typeof v === 'string' ? Number(v.replace(/,/g, '')) || 0 : 0);
  const byArea = new Map<string, number>();
  const metricCols = [demandCol, supplyCol, estimateCol].filter((v): v is string => !!v);
  if (!dummy) {
    for (const r of rows) {
      const a = String(r[areaCol as string] ?? 'Unspecified');
      let val = 0;
      for (const col of metricCols) {
        const candidate = sum(r[col]);
        if (Number.isFinite(candidate) && candidate !== 0) {
          val = candidate;
          break;
        }
      }
      if (!val && metricCols.length === 0) val = 1;
      byArea.set(a, (byArea.get(a) || 0) + (Number.isFinite(val) ? val : 0));
    }
  }
  if (!byArea.size && Array.isArray(totals) && totals.length) {
    totals.forEach((entry) => {
      const label = String(entry.area ?? 'Unspecified');
      const val = entry.demand || entry.supply || entry.estimate || 0;
      byArea.set(label, val);
    });
  }
  let items = Array.from(byArea.entries()).map(([name, value]) => ({ name, value }))
    .sort((x, y) => y.value - x.value);
  if (!items.length) {
    dummy = true;
    items = [
      { name: 'Area-1', value: 40 },
      { name: 'Area-2', value: 30 },
      { name: 'Area-3', value: 20 },
      { name: 'Area-4', value: 10 },
      { name: 'Area-5', value: 6 },
    ];
  }
  const segments = items;
  const highlightSet = highlight ?? new Set<string>();
  const decorated: Array<{ name: string; value: number; color?: string }> = segments.map((seg) => ({
    ...seg,
    color: highlightSet.size && highlightSet.has(seg.name) ? '#f97316' : undefined,
  }));
  return (
    <div>
      <DonutChart segments={decorated} />
    </div>
  );
};

const AreaHeatmap: React.FC<AreaAggProps> = ({ areaCol, demandCol, supplyCol, estimateCol, rows, totals, highlight }) => {
  let dummy = false;
  if (!areaCol) dummy = true;
  const toNum = (v: any) => (typeof v === 'number' ? v : (typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN));
  const d = new Map<string, { dem: number; sup: number }>();
  if (!dummy) {
    for (const r of rows) {
      const a = String(r[areaCol as string] ?? 'Unspecified');
      const demRaw = demandCol ? toNum(r[demandCol as string]) : (estimateCol ? toNum(r[estimateCol as string]) : NaN);
      const supRaw = supplyCol ? toNum(r[supplyCol as string]) : (estimateCol ? toNum(r[estimateCol as string]) : (demandCol ? toNum(r[demandCol as string]) : NaN));
      const obj = d.get(a) || { dem: 0, sup: 0 };
      if (Number.isFinite(demRaw)) obj.dem += Number(demRaw);
      if (Number.isFinite(supRaw)) obj.sup += Number(supRaw);
      d.set(a, obj);
    }
  }
  let cells = Array.from(d.entries()).map(([label, v]) => ({
    label,
    value: v.dem > 0 ? Math.max(0, Math.min(150, (v.sup / v.dem) * 100)) : (Number.isFinite(v.sup) ? 100 : 0),
    demand: v.dem,
    supply: v.sup,
  }));
  if (!cells.length && Array.isArray(totals) && totals.length) {
    cells = totals.map((entry) => {
      const demandVal = entry.demand || entry.estimate || entry.supply || 0;
      const supplyVal = entry.supply || entry.estimate || demandVal;
      const util = demandVal ? Math.max(0, Math.min(150, (supplyVal / demandVal) * 100)) : 100;
      return {
        label: entry.area || 'Unspecified',
        value: util,
        demand: demandVal,
        supply: supplyVal,
      };
    });
  }
  if (!cells.length) {
    dummy = true;
    cells = [
      { label: 'Area-1', value: 92, demand: 120, supply: 110 },
      { label: 'Area-2', value: 76, demand: 90, supply: 68 },
      { label: 'Area-3', value: 61, demand: 70, supply: 43 },
      { label: 'Area-4', value: 48, demand: 55, supply: 26 },
      { label: 'Area-5', value: 42, demand: 45, supply: 19 },
    ];
  }
  const csvRows = cells.map((c) => ({ area: c.label, utilization: Math.round(c.value), demand: Math.round(c.demand ?? 0), supply: Math.round(c.supply ?? 0) }));
  return (
    <div>
      <ChartActions filename="area-utilization" csvRows={csvRows} />
      <HeatmapGrid cells={cells} highlight={highlight} />
    </div>
  );
};
