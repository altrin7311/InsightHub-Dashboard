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
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, BarChart, Brush } from "recharts";

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
    if (!areaCol) return [] as string[];
    const set = new Set<string>();
    for (const row of filteredRows) {
      const label = row[areaCol];
      if (label == null) continue;
      set.add(String(label));
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [areaCol, filteredRows]);

  const [activeAreaScope, setActiveAreaScope] = React.useState<string>('All');
  const [selectedQuarters, setSelectedQuarters] = React.useState<string[]>([]);
  const [comparisonAreas, setComparisonAreas] = React.useState<string[]>([]);
  const [highlightedGapProject, setHighlightedGapProject] = React.useState<string | null>(null);
  const [highlightedGapAreas, setHighlightedGapAreas] = React.useState<Set<string>>(new Set());
  const bottlenecksRef = React.useRef<HTMLDivElement | null>(null);
  const [estimateReasons, setEstimateReasons] = React.useState<Record<string, string>>({});
  const [reasonDraft, setReasonDraft] = React.useState('');
  const [reasonTarget, setReasonTarget] = React.useState<{ key: string; project?: string | null; trial?: string | null; area?: string | null } | null>(null);
  const [forecastView, setForecastView] = React.useState<'stacked' | 'line' | 'bar'>('stacked');

  React.useEffect(() => {
    if (!quarterOptions.length) return;
    setSelectedQuarters((prev) => {
      const valid = prev.filter((q) => quarterOptions.includes(q));
      if (valid.length === prev.length && prev.length) return prev;
      const fallback = quarterOptions.slice(-5);
      return fallback.length ? fallback : valid;
    });
  }, [quarterOptions]);

  React.useEffect(() => {
    if (!areaOptions.length) {
      setComparisonAreas([]);
      if (activeAreaScope !== 'All') setActiveAreaScope('All');
      return;
    }
    setComparisonAreas((prev) => {
      const valid = prev.filter((a) => a === 'All' || areaOptions.includes(a));
      if (valid.includes('All')) return ['All'];
      if (valid.length) return valid;
      return ['All'];
    });
    if (activeAreaScope !== 'All' && !areaOptions.includes(activeAreaScope)) {
      setActiveAreaScope('All');
    }
  }, [areaOptions, activeAreaScope]);

  const areaScopeRows = React.useMemo(() => {
    if (!areaCol || activeAreaScope === 'All') return filteredRows;
    return filteredRows.filter((row) => String(row[areaCol]) === activeAreaScope);
  }, [filteredRows, areaCol, activeAreaScope]);

  const comparisonTargetAreas = React.useMemo(() => {
    if (!comparisonAreas.length || comparisonAreas.includes('All')) return ['All'];
    return comparisonAreas;
  }, [comparisonAreas]);

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
    if (!quarterCol || (!demandCol && !supplyCol && !estimateCol)) return [] as Array<{ quarter: string; area: string; estimate: number; demand: number; supply: number; gap: number; utilization: number | null }>;
    if (!selectedQuarters.length) return [];
    const normalizedQuarterSet = new Set(
      selectedQuarters.map((label) => {
        const parsed = parseQuarter(label);
        return parsed ? formatQuarter(parsed.year, parsed.quarter) : label;
      })
    );
    if (!normalizedQuarterSet.size) return [];
    const areaFilterSet = new Set(comparisonTargetAreas);
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
      const targets = areaFilterSet.has('All') ? ['All'] : (areaFilterSet.has(resolvedArea) ? [resolvedArea] : []);
      if (!targets.length) continue;

      const valEstimate = estimateCol ? num(row[estimateCol]) : NaN;
      const valDemand = demandCol ? num(row[demandCol]) : NaN;
      const valSupply = supplyCol ? num(row[supplyCol]) : NaN;

      for (const areaName of targets) {
        const key = `${normalizedQuarter}__${areaName}`;
        const current = buckets.get(key) || { quarter: normalizedQuarter, area: areaName, estimate: 0, demand: 0, supply: 0 };
        if (Number.isFinite(valEstimate)) current.estimate += Number(valEstimate);
        if (Number.isFinite(valDemand)) current.demand += Number(valDemand);
        if (Number.isFinite(valSupply)) current.supply += Number(valSupply);
        buckets.set(key, current);
      }
    }

    const quarterIndex = new Map(selectedQuarters.map((label, idx) => [label, idx]));
    const sortQuarter = (label: string) => {
      if (quarterIndex.has(label)) return quarterIndex.get(label) || 0;
      const parsed = parseQuarter(label);
      return parsed ? parsed.key : 0;
    };

    return Array.from(buckets.values())
      .map((entry) => ({
        ...entry,
        gap: entry.demand - entry.supply,
        utilization: entry.demand > 0 ? Number(((entry.supply / entry.demand) * 100).toFixed(1)) : null,
      }))
      .sort((a, b) => {
        const qa = sortQuarter(a.quarter);
        const qb = sortQuarter(b.quarter);
        if (qa !== qb) return qa - qb;
        return a.area.localeCompare(b.area);
      });
  }, [quarterCol, demandCol, supplyCol, estimateCol, filteredRows, selectedQuarters, comparisonTargetAreas]);

  const projectTotals = React.useMemo(() => {
    if (!projectCol || (!demandCol && !estimateCol)) return [] as Array<{ name: string; estimate: number; demand: number }>;
    const totals = new Map<string, { estimate: number; demand: number }>();
    for (const row of filteredRows) {
      const proj = String(row[projectCol] ?? '').trim();
      if (!proj) continue;
      const estVal = estimateCol ? num(row[estimateCol]) : NaN;
      const demVal = demandCol ? num(row[demandCol]) : NaN;
      const bucket = totals.get(proj) || { estimate: 0, demand: 0 };
      if (Number.isFinite(estVal)) bucket.estimate += Number(estVal);
      if (Number.isFinite(demVal)) bucket.demand += Number(demVal);
      totals.set(proj, bucket);
    }
    return Array.from(totals.entries())
      .map(([name, value]) => ({ name, estimate: value.estimate, demand: value.demand }))
      .sort((a, b) => b.demand - a.demand);
  }, [filteredRows, projectCol, estimateCol, demandCol]);

  const recentAreaPerformance = React.useMemo(() => {
    if (!quarterCol || !supplyCol) return [] as Array<Record<string, number | string>>;
    const lastFive = quarterOptions.slice(-5);
    if (!lastFive.length) return [];
    const normalized = lastFive.map((label) => {
      const parsed = parseQuarter(label);
      return parsed ? formatQuarter(parsed.year, parsed.quarter) : label;
    });
    const targetSet = new Set(normalized);
    const template = new Map<string, { quarter: string; totalDemand: number; totalSupply: number; areas: Record<string, number> }>();
    normalized.forEach((q) => {
      template.set(q, { quarter: q, totalDemand: 0, totalSupply: 0, areas: {} });
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
      const supplyVal = supplyCol ? num(row[supplyCol]) : NaN;
      const demandVal = demandCol ? num(row[demandCol]) : NaN;
      if (Number.isFinite(supplyVal)) {
        holder.totalSupply += Number(supplyVal);
        holder.areas[areaName] = (holder.areas[areaName] || 0) + Number(supplyVal);
      }
      if (Number.isFinite(demandVal)) {
        holder.totalDemand += Number(demandVal);
      }
    }

    return normalized.map((quarter) => {
      const entry = template.get(quarter) || { quarter, totalDemand: 0, totalSupply: 0, areas: {} };
      return { quarter, totalDemand: entry.totalDemand, totalSupply: entry.totalSupply, ...entry.areas };
    });
  }, [quarterCol, supplyCol, demandCol, areaCol, filteredRows, quarterOptions]);

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
      return {
        area,
        quarters,
        demandSeries,
        supplySeries,
        estimateSeries,
        latestGap: latest?.gap ?? 0,
        latestUtil,
        trendDelta,
      };
    });
    return ordered;
  }, [comparisonMatrix]);

  const areaPerformanceKeys = React.useMemo(() => {
    if (!recentAreaPerformance.length) return [] as string[];
    const keys = new Set<string>();
    recentAreaPerformance.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key !== 'quarter' && key !== 'totalDemand' && key !== 'totalSupply') {
          keys.add(key);
        }
      });
    });
    return Array.from(keys.values()).sort((a, b) => a.localeCompare(b));
  }, [recentAreaPerformance]);

  const projectChartSlice = React.useMemo(() => projectTotals.slice(0, 12), [projectTotals]);

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

  const toggleQuarter = React.useCallback((label: string) => {
    setSelectedQuarters((prev) => {
      if (prev.includes(label)) return prev.filter((q) => q !== label);
      const appended = [...prev, label];
      if (appended.length <= 5) return appended;
      return appended.slice(-5);
    });
  }, []);

  const toggleComparisonArea = React.useCallback((area: string) => {
    setComparisonAreas((prev) => {
      if (area === 'All') return ['All'];
      const withoutAll = prev.filter((a) => a !== 'All');
      if (withoutAll.includes(area)) {
        const next = withoutAll.filter((a) => a !== area);
        return next.length ? next : ['All'];
      }
      const next = [...withoutAll, area];
      return next.length ? next : ['All'];
    });
  }, []);

  const projects = data.metrics?.projects ?? (projectCol ? uniq(filteredRows.map((r) => r[projectCol as string])) : undefined);
  const areas = data.metrics?.areas ?? (areaCol ? uniq(filteredRows.map((r) => r[areaCol as string])) : undefined);

  const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

  const sumFrom = (rowsList: typeof filteredRows, col?: string) => (col ? rowsList.reduce((acc, r) => acc + (Number.isFinite(num(r[col])) ? num(r[col]) : 0), 0) : undefined);
  // Prefer backend metrics when available for "All"; fall back to scoped sums otherwise
  const totalDemand = (activeAreaScope === 'All' ? (data.metrics?.total_demand ?? undefined) : undefined) ?? sumFrom(areaScopeRows, demandCol);
  const totalSupply = (activeAreaScope === 'All' ? (data.metrics?.total_supply ?? undefined) : undefined) ?? sumFrom(areaScopeRows, supplyCol);

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
    for (const r of areaScopeRows) {
      const p = String(r[projectCol] ?? '');
      const d = num(r[demandCol]);
      if (Number.isFinite(d)) m.set(p, (m.get(p) || 0) + d);
    }
    return Array.from(m.entries()).map(([name, total]) => ({ name, total })).sort((a,b)=>b.total-a.total).slice(0,3);
  }, [projectCol, demandCol, areaScopeRows]);

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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Area focus</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[ 'All', ...areaOptions ].map((area) => (
                  <button
                    key={area}
                    className={`btn ${activeAreaScope === area ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => setActiveAreaScope(area)}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="chip">Rows: {data.row_count ?? rows.length}</span>
              {projects !== undefined && <span className="chip">Projects: {projects}</span>}
              {areas !== undefined && <span className="chip">Areas: {areas}</span>}
              <span className="chip">Earliest start: {fmtDate(earliest)}</span>
              <span className="chip">Latest end: {fmtDate(latest)}</span>
            </div>
            {(demandCol || supplyCol) && (
              <div className="chips">
                <span className="chip">Demand Σ ({activeAreaScope}): {isFiniteNumber(totalDemandShown) ? Math.round(totalDemandShown as number).toLocaleString() : '—'}</span>
                <span className="chip">Supply Σ ({activeAreaScope}): {isFiniteNumber(totalSupplyShown) ? Math.round(totalSupplyShown as number).toLocaleString() : '—'}</span>
                {isFiniteNumber(dsDelta) && <span className="chip">Gap: {Math.round((dsDelta as number) * 100) / 100}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="grid" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div className="card">
            <div className="card-header">Total Demand</div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="kpi-value kpi-enter">
                {isFiniteNumber(totalDemandShown) && demandAnimated !== undefined ? Math.round(demandAnimated).toLocaleString() : '—'}
                <span className="kpi-suffix">FTE</span>
              </div>
              <span className={`chip ${dsBadge.tone}`.trim()}>{dsBadge.label}</span>
            </div>
          </div>
          <div className="card">
            <div className="card-header">Total Supply</div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="kpi-value kpi-enter">
                {isFiniteNumber(totalSupplyShown) && supplyAnimated !== undefined ? Math.round(supplyAnimated).toLocaleString() : '—'}
                <span className="kpi-suffix">FTE</span>
              </div>
              <span className={`chip ${dsBadge.tone}`.trim()}>{dsBadge.label}</span>
            </div>
          </div>
          <div className="card">
            <div className="card-header">Utilization Rate</div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="kpi-value kpi-enter">
                {isFiniteNumber(utilPct) && utilAnimated !== undefined ? utilAnimated.toFixed(1) : '—'}
                <span className="kpi-suffix">%</span>
              </div>
              <span className={`chip ${utilBadge.tone}`.trim()}>{utilBadge.label}</span>
              <div className="muted">Supply / Demand</div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">Critical Bottlenecks</div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="kpi-value kpi-enter">{bottlenecksServer ?? bottlenecks ?? '—'}</div>
              <span className={`chip ${(bottlenecksServer ?? bottlenecks ?? 0) > 0 ? 'badge-red' : 'badge-green'}`.trim()}>
                {(bottlenecksServer ?? bottlenecks ?? 0) > 0 ? 'risk' : 'good'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid two">
          <div className="card">
            <div className="card-header">Highlights</div>
            <div className="card-body" style={{ display: 'grid', gap: 8 }}>
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
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Insights load once demand data syncs.</div>
                  <ChartLine labels={highlightPlaceholder.labels} series={highlightPlaceholder.series} height={120} />
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-header">Dataset Filters</div>
            <div className="card-body" style={{ display: 'grid', gap: 8 }}>
              <div className="muted">Active filters drive every chart below.</div>
              <div className="chips">
                {filters.project && <span className="chip">Project: {filters.project}</span>}
                {filters.trial && <span className="chip">Trial: {filters.trial}</span>}
                {filters.area && <span className="chip">Area: {filters.area}</span>}
                {filters.quarter && <span className="chip">Quarter: {filters.quarter}</span>}
                {!filters.project && !filters.trial && !filters.area && !filters.quarter && <span className="chip">No filters applied</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Quarter & Area Comparison</div>
          <div className="card-body" style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ minWidth: 200 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>Quarters (max 5)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {quarterOptions.map((quarter) => {
                    const active = selectedQuarters.includes(quarter);
                    return (
                      <button
                        key={quarter}
                        className={`btn ${active ? 'btn-secondary' : 'btn-ghost'}`}
                        onClick={() => toggleQuarter(quarter)}
                      >
                        {quarter}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ minWidth: 200 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>Areas</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {['All', ...areaOptions].map((area) => {
                    const active = comparisonTargetAreas.includes(area);
                    return (
                      <button
                        key={area}
                        className={`btn ${active ? 'btn-secondary' : 'btn-ghost'}`}
                        onClick={() => toggleComparisonArea(area)}
                      >
                        {area}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {comparisonCards.length ? (
              <div className="comparison-cards">
                {comparisonCards.map((card) => (
                  <div className="comparison-card" key={`comparison-${card.area}`}>
                    <h4>{card.area}</h4>
                    <div className="muted">{card.quarters[0] ?? 'n/a'} → {card.quarters[card.quarters.length - 1] ?? 'n/a'}</div>
                    <div className="sparkline-wrap">
                      <ChartLine
                        labels={card.quarters}
                        series={[
                          { name: 'Demand', color: '#22c55e', data: card.demandSeries },
                          { name: 'Supply', color: '#60a5fa', data: card.supplySeries },
                        ]}
                        height={60}
                      />
                    </div>
                    <div className="chips" style={{ gap: 6 }}>
                      <span className={`chip ${card.latestGap > 0 ? 'badge-red' : 'badge-green'}`.trim()}>
                        Gap {Number(card.latestGap).toFixed(1)}
                      </span>
                      {card.latestUtil != null && (
                        <span className="chip">Util {card.latestUtil.toFixed(1)}%</span>
                      )}
                      {card.trendDelta != null && (
                        <span className={`chip ${card.trendDelta > 0 ? 'badge-green' : 'badge-amber'}`.trim()}>
                          {card.trendDelta > 0 ? '+' : ''}{card.trendDelta.toFixed(1)}% demand Δ
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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

        <div className="card">
          <div className="card-header">Demand Σ vs Estimate Σ by Project</div>
          <div className="card-body">
            {projectChartSlice.length ? (
              <ChartLine
                labels={projectChartSlice.map((p) => p.name)}
                series={[
                  { name: 'Estimate Σ', color: '#60a5fa', data: projectChartSlice.map((p) => Number(p.estimate.toFixed(2))) },
                  { name: 'Demand Σ', color: '#22c55e', data: projectChartSlice.map((p) => Number(p.demand.toFixed(2))) },
                ]}
                height={320}
              />
            ) : (
              <div className="muted">Upload data with project identifiers to view the trend.</div>
            )}
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
            <div className="card-body">
              <AreaDonut areaCol={areaCol} demandCol={demandCol} rows={areaScopeRows} highlight={highlightedGapAreas} />
            </div>
          </div>
          <div className="card">
            <div className="card-header">Area utilization map</div>
            <div className="card-body">
              <AreaHeatmap areaCol={areaCol} demandCol={demandCol} supplyCol={supplyCol} rows={areaScopeRows} highlight={highlightedGapAreas} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Area performance (last 5 quarters)</div>
          <div className="card-body" style={{ height: 340 }}>
            {recentAreaPerformance.length ? (
              <>
                <ChartActions filename="area-performance" csvRows={recentAreaPerformance as any[]} />
                <ResponsiveContainer>
                  <ComposedChart data={recentAreaPerformance} margin={{ top: 12, right: 32, left: 46, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="quarter" tick={{ fill: 'var(--muted)' }} />
                    <YAxis tick={{ fill: 'var(--muted)' }} />
                    <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
                    <Legend wrapperStyle={{ color: 'var(--muted)' }} />
                    {areaPerformanceKeys.map((key, idx) => (
                      <Bar key={key} dataKey={key} stackId="areas" fill={AREA_COLORS[idx % AREA_COLORS.length]} radius={[6, 6, 0, 0]} />
                    ))}
                    <Line type="monotone" dataKey="totalDemand" name="Demand total" stroke="#f97316" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="totalSupply" name="Supply total" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Brush dataKey="quarter" travellerWidth={10} height={24} stroke="var(--primary)" fill="rgba(15,22,32,0.85)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="muted">Need quarter and area data to plot performance.</div>
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
                  <ResponsiveContainer>
                    <BarChart data={combinedSeriesData} margin={{ top: 12, right: 24, left: 46, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="name" tick={{ fill: 'var(--muted)' }} angle={combinedSeriesData.length > 8 ? -30 : 0} textAnchor={combinedSeriesData.length > 8 ? 'end' : 'middle'} />
                      <YAxis tick={{ fill: 'var(--muted)' }} width={46} allowDecimals={false} />
                      <Tooltip formatter={(v: any, n: any) => [Number(v).toFixed(2) + ' FTE', n]} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
                      <Legend wrapperStyle={{ color: 'var(--muted)' }} />
                      <Bar dataKey="estimate" name="Estimate" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="demand" name="Demand" fill="#22c55e" radius={[6, 6, 0, 0]} />
                      <Brush dataKey="name" travellerWidth={10} height={24} stroke="var(--primary)" fill="rgba(15,22,32,0.85)" />
                    </BarChart>
                  </ResponsiveContainer>
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
type AreaAggProps = { areaCol?: string; demandCol?: string; supplyCol?: string; rows: Array<Record<string, any>>; highlight?: Set<string> };

const AreaDonut: React.FC<Omit<AreaAggProps, 'supplyCol'>> = ({ areaCol, demandCol, rows, highlight }) => {
  let dummy = false;
  if (!areaCol) dummy = true;
  const sum = (v: any) => (typeof v === 'number' && Number.isFinite(v)) ? v : (typeof v === 'string' ? Number(v.replace(/,/g, '')) || 0 : 0);
  const byArea = new Map<string, number>();
  if (!dummy) {
    for (const r of rows) {
      const a = String(r[areaCol as string] ?? '');
      const val = demandCol ? sum(r[demandCol]) : 1; // fallback to counts
      byArea.set(a, (byArea.get(a) || 0) + (Number.isFinite(val) ? val : 0));
    }
  }
  let items = Array.from(byArea.entries()).map(([name, value]) => ({ name, value }))
    .sort((x,y)=>y.value-x.value);
  if (!items.length) {
    dummy = true;
    items = [
      { name: 'Area-1', value: 40 },
      { name: 'Area-2', value: 30 },
      { name: 'Area-3', value: 20 },
      { name: 'Area-4', value: 10 },
    ];
  }
  const top = items.slice(0,6);
  const rest = items.slice(6).reduce((a, x)=>a+x.value, 0);
  const segments = rest ? [...top, { name: 'Others', value: rest }] : top;
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

const AreaHeatmap: React.FC<AreaAggProps> = ({ areaCol, demandCol, supplyCol, rows, highlight }) => {
  let dummy = false;
  if (!areaCol || !demandCol || !supplyCol) dummy = true;
  const toNum = (v: any) => (typeof v === 'number' ? v : (typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN));
  const d = new Map<string, { dem: number; sup: number }>();
  if (!dummy) {
    for (const r of rows) {
      const a = String(r[areaCol as string] ?? '');
      const dem = toNum(r[demandCol as string]);
      const sup = toNum(r[supplyCol as string]);
      const obj = d.get(a) || { dem: 0, sup: 0 };
      obj.dem += Number.isFinite(dem) ? dem : 0;
      obj.sup += Number.isFinite(sup) ? sup : 0;
      d.set(a, obj);
    }
  }
  let cells = Array.from(d.entries()).map(([label, v]) => ({
    label,
    value: v.dem > 0 ? Math.max(0, Math.min(150, 100 * v.sup / v.dem)) : 0,
    demand: v.dem,
    supply: v.sup,
  }));
  if (!cells.length) {
    dummy = true;
    cells = [
      { label: 'Area-1', value: 92, demand: 120, supply: 110 },
      { label: 'Area-2', value: 76, demand: 90, supply: 68 },
      { label: 'Area-3', value: 61, demand: 70, supply: 43 },
      { label: 'Area-4', value: 48, demand: 55, supply: 26 },
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
