export type Quarter = { year: number; quarter: number; key: number };

const QUARTER_REGEX = /Q\s*(\d)\s*(?:[-\/\s]*)\s*(\d{4})|(?:\b(\d{4})\s*(?:[-\/\s]*)Q\s*(\d))/i;

export function parseQuarter(label: string): Quarter | null {
  if (!label) return null;
  const match = QUARTER_REGEX.exec(label.trim());
  if (!match) return null;
  const q = Number(match[1] || match[4]);
  const year = Number(match[2] || match[3]);
  if (!year || !q || q < 1 || q > 4) return null;
  return { year, quarter: q, key: year * 4 + (q - 1) };
}

export function formatQuarter(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}

export function nextQuarter(input: Quarter): Quarter {
  const nextQ = input.quarter === 4 ? 1 : input.quarter + 1;
  const nextYear = input.quarter === 4 ? input.year + 1 : input.year;
  return { year: nextYear, quarter: nextQ, key: nextYear * 4 + (nextQ - 1) };
}

export function averageRatio(numerators: number[], denominators: number[]): number | undefined {
  const ratios: number[] = [];
  const len = Math.min(numerators.length, denominators.length);
  for (let i = 0; i < len; i++) {
    const num = numerators[i];
    const den = denominators[i];
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) continue;
    ratios.push(num / den);
  }
  if (!ratios.length) return undefined;
  return ratios.reduce((acc, r) => acc + r, 0) / ratios.length;
}

function projectNextValue(series: number[]): number {
  const values = series.filter((v) => Number.isFinite(v)) as number[];
  if (!values.length) return 0;
  const tail = values.slice(-4);
  if (tail.length < 2) return tail[tail.length - 1] ?? 0;
  const diffs = tail.slice(1).map((v, idx) => v - tail[idx]);
  const slope = diffs.reduce((acc, d) => acc + d, 0) / diffs.length;
  return Math.max(0, tail[tail.length - 1] + slope);
}

type SeriesInput = {
  labels: string[];
  estimate: number[];
  demand: number[];
  supply: number[];
  ci?: { lower: number[]; upper: number[] };
  forecast?: { labels: string[]; values: number[]; ci?: { lower: number[]; upper: number[] } };
};

type ForecastSource = { labels: string[]; values: number[]; ci?: { lower: number[]; upper: number[] } } | null | undefined;

export type ExtendedSeries = {
  labels: string[];
  estimate: number[];
  demand: number[];
  supply: number[];
  ci?: { lower: number[]; upper: number[] };
};

export function extendSeriesToYear(
  base: SeriesInput,
  opts: { mlForecast?: ForecastSource; targetYear?: number; maxFutureQuarters?: number } = {}
): ExtendedSeries {
  const targetYear = opts.targetYear ?? 2035;
  const maxFuture = typeof opts.maxFutureQuarters === 'number' && opts.maxFutureQuarters > 0
    ? Math.max(0, Math.floor(opts.maxFutureQuarters))
    : Number.POSITIVE_INFINITY;
  const labels = [...base.labels];
  const estimate = [...base.estimate];
  const demand = [...base.demand];
  const supply = [...base.supply];
  const lower = base.ci?.lower ? [...base.ci.lower] : undefined;
  const upper = base.ci?.upper ? [...base.ci.upper] : undefined;

  if (!labels.length) {
    return { labels, estimate, demand, supply, ci: lower && upper ? { lower, upper } : undefined };
  }

  const lastLabel = labels[labels.length - 1];
  const lastQuarter = parseQuarter(lastLabel);
  if (!lastQuarter) {
    return { labels, estimate, demand, supply, ci: lower && upper ? { lower, upper } : undefined };
  }

  const takeForecast = (source?: ForecastSource) => {
    if (!source?.labels?.length || !source?.values?.length) return new Map<string, number>();
    const map = new Map<string, number>();
    const len = Math.min(source.labels.length, source.values.length);
    for (let i = 0; i < len; i++) {
      const label = source.labels[i];
      const value = source.values[i];
      if (label && Number.isFinite(value)) {
        map.set(label, value);
      }
    }
    return map;
  };

  const forecastMap = takeForecast(base.forecast);
  const mlMap = takeForecast(opts.mlForecast);

  const ciMap = (source?: ForecastSource) => {
    if (!source?.labels || !source.ci?.lower || !source.ci?.upper) return new Map<string, { lower: number; upper: number }>();
    const map = new Map<string, { lower: number; upper: number }>();
    const len = Math.min(source.labels.length, source.ci.lower.length, source.ci.upper.length);
    for (let i = 0; i < len; i++) {
      const label = source.labels[i];
      const lo = source.ci.lower[i];
      const hi = source.ci.upper[i];
      if (label && Number.isFinite(lo) && Number.isFinite(hi)) {
        map.set(label, { lower: lo, upper: hi });
      }
    }
    return map;
  };

  const forecastCI = ciMap(base.forecast);
  const mlCI = ciMap(opts.mlForecast ?? undefined);

  const ratioEstimate = averageRatio(estimate, demand);
  const ratioSupply = averageRatio(supply, demand);
  const lastSpread = lower && upper && lower.length && upper.length
    ? Math.max(0, (upper[upper.length - 1] ?? 0) - (demand[demand.length - 1] ?? 0))
    : 0;

  const maxFutureYears = Number.isFinite(maxFuture)
    ? lastQuarter.year + Math.ceil(maxFuture / 4)
    : targetYear;
  const effectiveTargetYear = Math.min(targetYear, maxFutureYears);

  let pointer = lastQuarter;
  let added = 0;
  while (pointer.year <= effectiveTargetYear) {
    if (added >= maxFuture) break;
    pointer = nextQuarter(pointer);
    if (pointer.year > effectiveTargetYear) break;
    const label = formatQuarter(pointer.year, pointer.quarter);
    labels.push(label);
    
    const forecastVal = forecastMap.get(label);
    const mlVal = mlMap.get(label);
    const projected = projectNextValue(demand);
    const nextDemand = Number.isFinite(forecastVal)
      ? Number(forecastVal)
      : Number.isFinite(mlVal)
        ? Number(mlVal)
        : projected;
    demand.push(Number.isFinite(nextDemand) ? Number(nextDemand) : 0);

    const derivedEstimate = ratioEstimate && Number.isFinite(nextDemand)
      ? Math.max(0, nextDemand * ratioEstimate)
      : projectNextValue(estimate);
    estimate.push(Number.isFinite(derivedEstimate) ? Number(derivedEstimate) : 0);

    const derivedSupply = ratioSupply && Number.isFinite(nextDemand)
      ? Math.max(0, nextDemand * ratioSupply)
      : projectNextValue(supply);
    supply.push(Number.isFinite(derivedSupply) ? Number(derivedSupply) : 0);

    if (lower && upper) {
      const ciEntry = forecastCI.get(label) || mlCI.get(label);
      if (ciEntry) {
        lower.push(ciEntry.lower);
        upper.push(ciEntry.upper);
      } else if (Number.isFinite(nextDemand)) {
        const spread = lastSpread || Math.abs(nextDemand) * 0.08;
        lower.push(Math.max(0, nextDemand - spread));
        upper.push(nextDemand + spread);
      } else {
        lower.push(0);
        upper.push(0);
      }
    }

    added += 1;
  }

  const ci = lower && upper ? { lower, upper } : undefined;
  return { labels, estimate, demand, supply, ci };
}
