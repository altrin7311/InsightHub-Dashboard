from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
import pandas as pd
import os
from io import BytesIO, StringIO
import numpy as np
import re
import math
from datetime import datetime

app = FastAPI()
# Very simple in-memory cache of last uploaded dataset for metrics
LAST_DATA: dict = {}
# Cache most recent model training runs (real vs augmented)
LAST_TRAINING: dict[str, dict | None] = {"real": None, "augmented": None}

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        # Add your deployed frontend URLs here as needed
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/upload-excel/")
async def upload_excel(file: UploadFile = File(...)):
    """
    Accepts an uploaded Excel (.xlsx/.xls) or CSV file and returns
    filename, columns, and a 10-row preview.
    """
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()

    try:
        contents = await file.read()
        if ext in [".xlsx", ".xls"]:
            # Read all sheets and merge; infer Area from sheet name when missing
            if ext == ".xlsx":
                sheets = pd.read_excel(BytesIO(contents), engine="openpyxl", sheet_name=None)
            else:
                try:
                    sheets = pd.read_excel(BytesIO(contents), engine="xlrd", sheet_name=None)
                except Exception:
                    raise HTTPException(
                        status_code=400,
                        detail=".xls parsing failed. Please convert to .xlsx or upload as .csv",
                    )
            frames = []
            for sname, sdf in (sheets or {}).items():
                if not isinstance(sdf, pd.DataFrame):
                    continue
                sdf = sdf.copy()
                if 'Area' not in sdf.columns and isinstance(sname, str) and sname.strip():
                    sdf['Area'] = sname
                sdf['__sheet__'] = sname
                frames.append(sdf)
            if not frames:
                raise HTTPException(status_code=400, detail="No readable sheets found in workbook")
            df = pd.concat(frames, ignore_index=True, sort=False)
        elif ext == ".csv":
            # Try to decode as UTF-8; fallback to latin-1 if needed
            try:
                text = contents.decode("utf-8")
            except UnicodeDecodeError:
                text = contents.decode("latin-1")
            df = pd.read_csv(StringIO(text))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Please upload .xlsx, .xls, or .csv")

        # Normalize columns to strings
        df.columns = [str(c) for c in df.columns]

        total_rows = int(len(df))

        # Helper to JSON-safe dict/list
        def json_safe(obj):
            if isinstance(obj, pd.DataFrame):
                obj = obj.replace({np.nan: None, np.inf: None, -np.inf: None})
                return obj.to_dict(orient="records")
            if isinstance(obj, (pd.Series,)):
                obj = obj.replace({np.nan: None, np.inf: None, -np.inf: None})
                return obj.tolist()
            return obj

        # Build preview
        safe_preview_df = df.head(10).replace({np.nan: None, np.inf: None, -np.inf: None})
        preview = safe_preview_df.to_dict(orient="records")

        # Preprocessing: try to infer standard fields and build simple timeseries from quarter columns
        cols = df.columns.tolist()

        def norm(s: str) -> str:
            return re.sub(r"[^a-z0-9]", "", s.lower())

        nmap = {c: norm(str(c)) for c in cols}

        def find_col(candidates: list[str]):
            for c, nc in nmap.items():
                for cand in candidates:
                    if cand in nc:
                        return c
            return None

        project_col = find_col(["projectid", "project", "projid"]) or None
        area_col = find_col(["area", "region"]) or None
        trial_col = find_col(["trialid", "trial", "trialno"]) or None
        phase_col = find_col(["phase", "trialphase"]) or None
        demand_col = find_col(["demand"]) or None
        supply_col = find_col(["supply"]) or None
        class_col = find_col(["demandsupply", "demands", "demandandsupply", "demands/", "demandorsupply", "demandvssupply"]) or None
        start_col = find_col(["fpfv", "firstpatientfirstvisit", "start"]) or None
        end_col = find_col(["dbl", "lplv", "complete", "end"]) or None

        # Metrics (full DF when possible)
        def to_num(x):
            try:
                if pd.isna(x):
                    return np.nan
            except Exception:
                pass
            if isinstance(x, (int, float, np.floating, np.integer)):
                return float(x)
            if isinstance(x, str):
                try:
                    return float(x.replace(",", ""))
                except Exception:
                    return np.nan
            return np.nan

        total_demand = float(df[demand_col].map(to_num).sum()) if demand_col in df.columns else None
        total_supply = float(df[supply_col].map(to_num).sum()) if supply_col in df.columns else None

        # Demand/Supply counts from class column (if numeric columns not present)
        ds_counts = None
        if class_col in df.columns:
            counts = {"demand": 0, "supply": 0, "other": 0}
            for v in df[class_col].astype(str).str.lower().tolist():
                if "demand" in v:
                    counts["demand"] += 1
                elif "supply" in v:
                    counts["supply"] += 1
                else:
                    counts["other"] += 1
            ds_counts = counts

        # Quarter wide-column detection (Q1 20 Estimate / Q1 20 Demand / Supply)
        quarter_pattern = re.compile(r"^q\s*([1-4])\s*('?\s*[0-9]{2,4})\s*(estimate|esti|demand|supply|dem)$", re.I)
        quarter_cols: list[tuple[str, int, int, str]] = []  # (col, year, quarter, kind)
        for c in cols:
            s = re.sub(r"\s+", " ", str(c).strip().lower())
            m = quarter_pattern.match(s)
            if m:
                q = int(m.group(1))
                yraw = re.sub(r"[^0-9]", "", m.group(2))
                y = int(yraw)
                y = 2000 + y if y < 100 else y
                kind = m.group(3).lower()
                if kind.startswith("esti"): kind = "estimate"
                if kind.startswith("dem"): kind = "demand"
                quarter_cols.append((c, y, q, kind))

        series = None
        if quarter_cols:
            # Aggregate per (year, quarter)
            agg: dict[tuple[int,int], dict[str, float]] = {}
            # For bottlenecks and CI we also need per-row values per quarter
            demand_cols = []
            estimate_cols = []
            for col, y, q, kind in quarter_cols:
                vals = df[col].map(to_num)
                key = (y, q)
                if key not in agg:
                    agg[key] = {"estimate": 0.0, "demand": 0.0, "supply": 0.0}
                if kind in agg[key]:
                    agg[key][kind] += float(vals.fillna(0).sum())
                if kind == "demand":
                    demand_cols.append(col)
                elif kind == "estimate":
                    estimate_cols.append(col)
            # Sort by year, quarter
            keys = sorted(agg.keys())
            labels = [f"Q{q} {y}" for (y, q) in keys]
            estimate = [round(float(agg[k]["estimate"]) if math.isfinite(float(agg[k]["estimate"])) else 0.0, 2) for k in keys]
            demand_s = [round(float(agg[k]["demand"]) if math.isfinite(float(agg[k]["demand"])) else 0.0, 2) for k in keys]
            supply_s = [round(float(agg[k]["supply"]) if math.isfinite(float(agg[k]["supply"])) else 0.0, 2) for k in keys]
            # If supply is missing, approximate with estimate
            if not any(supply_s) and any(estimate):
                supply_s = estimate[:]
            # Simple CI band: ±10% of demand values (or estimate if demand empty)
            base_for_ci = demand_s if any(demand_s) else estimate
            ci_lower = [round(v * 0.9, 2) for v in base_for_ci]
            ci_upper = [round(v * 1.1, 2) for v in base_for_ci]
            series = {
                "labels": labels,
                "estimate": estimate,
                "demand": demand_s,
                "supply": supply_s,
                "ci": {"lower": ci_lower, "upper": ci_upper},
            }
            def _sanitize(nums):
                cleaned = []
                for val in nums or []:
                    try:
                        f = float(val)
                    except Exception:
                        f = 0.0
                    if not math.isfinite(f):
                        f = 0.0
                    cleaned.append(round(f, 4))
                return cleaned
            series["estimate"] = _sanitize(series.get("estimate"))
            series["demand"] = _sanitize(series.get("demand"))
            series["supply"] = _sanitize(series.get("supply"))
            if series.get("ci"):
                series["ci"]["lower"] = _sanitize(series["ci"].get("lower"))
                series["ci"]["upper"] = _sanitize(series["ci"].get("upper"))

            # Row-level totals to identify bottlenecks (demand > estimate)
            row_demand_total = df[demand_cols].apply(lambda col: col.map(to_num)).fillna(0).sum(axis=1) if demand_cols else None
            row_estimate_total = df[estimate_cols].apply(lambda col: col.map(to_num)).fillna(0).sum(axis=1) if estimate_cols else None
            bottlenecks = []
            if row_demand_total is not None and row_estimate_total is not None:
                gaps = row_demand_total - row_estimate_total
                idxs = gaps[gaps > 0].sort_values(ascending=False).head(10).index.tolist()
                for i in idxs:
                    bottlenecks.append({
                        "project": str(df.loc[i, project_col]) if project_col in df.columns else None,
                        "trial": str(df.loc[i, trial_col]) if trial_col in df.columns else None,
                        "area": str(df.loc[i, area_col]) if area_col in df.columns else None,
                        "demand_total": float(row_demand_total.loc[i]),
                        "estimate_total": float(row_estimate_total.loc[i]),
                        "gap": float(gaps.loc[i]),
                    })
            else:
                bottlenecks = None

            # Optional ML forecast using statsmodels Holt-Winters if available
            ml = None
            try:
                from statsmodels.tsa.holtwinters import ExponentialSmoothing

                base = demand_s if any(demand_s) else estimate
                if len(base) >= 8:
                    seasonal_periods = 4  # quarters
                    model = ExponentialSmoothing(base, trend='add', seasonal='add', seasonal_periods=seasonal_periods)
                    fit = model.fit(optimized=True)
                    steps = 8
                    forecast = fit.forecast(steps)
                    # crude CI using residual std
                    resid = np.array(base) - fit.fittedvalues
                    sigma = float(np.nanstd(resid)) if resid.size else 0.0
                    lower = [float(v - 1.96 * sigma) for v in forecast]
                    upper = [float(v + 1.96 * sigma) for v in forecast]
                    # Extend labels by steps
                    def next_quarters(lbls, n):
                        out = []
                        last = lbls[-1]
                        # last format: Q{q} {y}
                        m = re.match(r"Q(\d)\s+(\d{4})", last)
                        q = int(m.group(1)) if m else 4
                        y = int(m.group(2)) if m else 2030
                        for _ in range(n):
                            q += 1
                            if q > 4:
                                q = 1
                                y += 1
                            out.append(f"Q{q} {y}")
                        return out
                    labels_ext = next_quarters(labels, steps)
                    ml = {"labels": labels_ext, "forecast": [float(v) for v in forecast], "ci": {"lower": lower, "upper": upper}}
            except Exception:
                ml = None

        # If totals not available from single columns, compute them from series if present
        if total_demand is None and series and series.get("demand"):
            total_demand = float(sum(series["demand"]))
        if total_supply is None and series and series.get("supply"):
            total_supply = float(sum(series["supply"]))

        # Build filter options from full dataset
        def uniq_list(column: str | None, limit: int = 500):
            if column and column in df.columns:
                vals = (
                    df[column]
                    .dropna()
                    .astype(str)
                    .map(lambda x: x.strip())
                    .replace("", np.nan)
                    .dropna()
                    .unique()
                    .tolist()
                )
                vals = [v for v in vals if v]
                vals.sort()
                return vals[:limit]
            return []

        filters = {
            "projects": uniq_list(project_col),
            "trials": uniq_list(trial_col),
            "areas": uniq_list(area_col),
            "quarters": series["labels"] if series else [],
            "phases": uniq_list(phase_col),
        }

        # --- Synthetic data augmentation helper ---------------------------------
        def augment_dataframe(df_in: pd.DataFrame,
                               quarter_cols_in: list[tuple[str, int, int, str]],
                               project_col_in: str | None,
                               trial_col_in: str | None,
                               area_col_in: str | None,
                               factor: float = 3.0,
                               seed: int = 42) -> pd.DataFrame:
            """Return a copy of df_in with additional synthetic rows.
            - Samples existing rows and perturbs quarter values by ~12% noise.
            - Creates slightly altered project/trial IDs so they are unique.
            - Preserves distribution of areas when available.
            """
            if not quarter_cols_in:
                return df_in.copy()
            rng = np.random.default_rng(seed)
            df_base = df_in.copy()
            n = len(df_base)
            target = max(int(math.ceil(n * factor)), n + 50)
            extra = max(0, target - n)
            if extra == 0 or n == 0:
                return df_base

            # Pre-collect area values for sampling
            area_vals = []
            if area_col_in and area_col_in in df_base.columns:
                area_vals = df_base[area_col_in].dropna().astype(str).tolist()
                if not area_vals:
                    area_vals = ["Area-A", "Area-B", "Area-C"]

            synth_rows: list[dict] = []
            for _ in range(extra):
                idx = int(rng.integers(0, n))
                row = df_base.iloc[idx].to_dict()
                # Noise for quarter numeric columns
                for col, _y, _q, _kind in quarter_cols_in:
                    if col in df_base.columns:
                        try:
                            v = float(str(row.get(col, "")).replace(",", ""))
                        except Exception:
                            v = np.nan
                        if not (isinstance(v, (int, float)) and math.isfinite(v)):
                            v = 0.0
                        noise = rng.normal(loc=1.0, scale=0.12)
                        row[col] = max(0.0, round(v * float(noise), 3))

                # New identifiers to avoid duplicating exact rows
                suffix = int(rng.integers(1000, 9999))
                if project_col_in and project_col_in in df_base.columns:
                    basep = str(row.get(project_col_in, "Proj"))[:40]
                    row[project_col_in] = f"{basep}-S{suffix}"
                if trial_col_in and trial_col_in in df_base.columns:
                    baset = str(row.get(trial_col_in, "Trial"))[:40]
                    row[trial_col_in] = f"{baset}-S{suffix%1000}"
                if area_vals and area_col_in and area_col_in in df_base.columns:
                    row[area_col_in] = area_vals[int(rng.integers(0, len(area_vals)))]

                synth_rows.append(row)

            df_augmented = pd.concat([df_base, pd.DataFrame(synth_rows)], ignore_index=True, sort=False)
            return df_augmented

        # Build augmented data once
        df_aug = augment_dataframe(df, quarter_cols, project_col, trial_col, area_col)

        # cache for later filtering
        LAST_DATA.update({
            "df": df,
            "cols": cols,
            "project_col": project_col,
            "area_col": area_col,
            "trial_col": trial_col,
            "phase_col": phase_col,
            "demand_col": demand_col,
            "supply_col": supply_col,
            "class_col": class_col,
            "start_col": start_col,
            "end_col": end_col,
            "quarter_cols": quarter_cols,
            # Precompute and store an augmented version for forecasting use-cases
            "df_aug": df_aug,
        })

        payload = {
            "filename": filename,
            "columns": cols,
            "preview": preview,
            "row_count": total_rows,
            "aug_row_count": int(len(df_aug)),
            "schema": {
                "project": project_col,
                "area": area_col,
                "trial": trial_col,
                "phase": phase_col,
                "demand": demand_col,
                "supply": supply_col,
                "class": class_col,
                "start": start_col,
                "end": end_col,
            },
            "metrics": {
                "total_demand": total_demand,
                "total_supply": total_supply,
                "class_counts": ds_counts,
                "projects": int(df[project_col].nunique()) if project_col in df.columns else None,
                "areas": int(df[area_col].nunique()) if area_col in df.columns else None,
                "utilization_rate": (float(total_supply)/float(total_demand) * 100.0) if (total_supply and total_demand) else None,
            },
            "timeseries": series,
            "ml": ml,
            "bottlenecks": bottlenecks or [],
            "filters": filters,
            "aug_preview": df_aug.head(10).replace({np.nan: None, np.inf: None, -np.inf: None}).to_dict(orient="records"),
        }
        # Aggregate per-quarter area metrics for frontend comparisons when no explicit quarter column exists
        area_quarter_stats: dict[tuple[str, str], dict[str, float | str | None]] = {}
        area_totals: dict[str, dict[str, float]] = {}
        if quarter_cols:
            for _, row in df.iterrows():
                area_name = "All"
                if area_col and area_col in df.columns:
                    raw = row.get(area_col)
                    area_name = str(raw).strip() if raw is not None and str(raw).strip() else "Unspecified"
                for col, yy, qq, kind in quarter_cols:
                    if col not in df.columns:
                        continue
                    val = to_num(row.get(col))
                    if not (isinstance(val, (int, float)) and math.isfinite(val)):
                        continue
                    label = f"Q{qq} {yy}"
                    bucket = area_quarter_stats.setdefault((label, area_name), {
                        "quarter": label,
                        "year": int(yy),
                        "q": int(qq),
                        "area": area_name,
                        "estimate": 0.0,
                        "demand": 0.0,
                        "supply": 0.0,
                    })
                    if kind == "demand":
                        bucket["demand"] = float(bucket.get("demand", 0.0) + float(val))
                    elif kind == "supply":
                        bucket["supply"] = float(bucket.get("supply", 0.0) + float(val))
                    else:
                        bucket["estimate"] = float(bucket.get("estimate", 0.0) + float(val))

                    totals = area_totals.setdefault(area_name, {"estimate": 0.0, "demand": 0.0, "supply": 0.0})
                    if kind == "demand":
                        totals["demand"] += float(val)
                    elif kind == "supply":
                        totals["supply"] += float(val)
                    else:
                        totals["estimate"] += float(val)

        if area_quarter_stats:
            matrix_rows: list[dict[str, float | str | None]] = []
            for key, entry in area_quarter_stats.items():
                estimate = float(entry.get("estimate", 0.0) or 0.0)
                demand_val = float(entry.get("demand", 0.0) or 0.0)
                supply_val = float(entry.get("supply", 0.0) or 0.0)
                if supply_val == 0.0 and estimate:
                    supply_val = estimate
                if supply_val == 0.0 and demand_val and not estimate:
                    supply_val = demand_val
                gap = demand_val - supply_val
                util = (supply_val / demand_val * 100.0) if demand_val else None
                matrix_rows.append({
                    "quarter": entry["quarter"],
                    "area": entry["area"],
                    "estimate": round(estimate, 3),
                    "demand": round(demand_val, 3),
                    "supply": round(supply_val, 3),
                    "gap": round(gap, 3),
                    "utilization": None if util is None else round(util, 3),
                    "year": entry["year"],
                    "quarter_index": entry["q"],
                })
            matrix_rows.sort(key=lambda r: (int(r.get("year", 0) or 0), int(r.get("quarter_index", 0) or 0), str(r.get("area", ""))))
            for row in matrix_rows:
                row.pop("year", None)
                row.pop("quarter_index", None)
            payload["area_quarter_matrix"] = matrix_rows
            LAST_DATA["area_quarter_matrix"] = matrix_rows

        if area_totals:
            totals_payload = []
            for area_name, stats in area_totals.items():
                est = float(stats.get("estimate", 0.0) or 0.0)
                dem = float(stats.get("demand", 0.0) or 0.0)
                sup = float(stats.get("supply", 0.0) or 0.0)
                if sup == 0.0 and est:
                    sup = est
                if sup == 0.0 and dem and not est:
                    sup = dem
                totals_payload.append({
                    "area": area_name,
                    "estimate": round(est, 3),
                    "demand": round(dem, 3),
                    "supply": round(sup, 3),
                })
            totals_payload.sort(key=lambda item: item["area"] or "")
            payload["area_totals"] = totals_payload
            LAST_DATA["area_totals"] = totals_payload

        # Automatically train models for both datasets when new data is uploaded
        training_records: dict[str, dict | None] = {}
        for augmented_flag in (False, True):
            key = "augmented" if augmented_flag else "real"
            try:
                record = store_training_result(augmented_flag)
            except Exception as exc:  # pragma: no cover - defensive guard
                record = {
                    "status": "error",
                    "timestamp": datetime.utcnow().isoformat() + 'Z',
                    "augmented": augmented_flag,
                    "result": None,
                    "error": str(exc),
                    "horizon": 8,
                }
                LAST_TRAINING[key] = record
            training_records[key] = record
        if training_records:
            payload["training"] = training_records
        return jsonable_encoder(payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")


class ChatRequest(BaseModel):
    question: str
    columns: list[str] | None = None
    preview: list[dict] | None = None
    row_count: int | None = None
    metrics: dict | None = None
    timeseries: dict | None = None


@app.post("/chat")
async def chat(req: ChatRequest):
    q = (req.question or "").lower()
    cols = req.columns or []
    rows = req.preview or []

    def num(v):
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v.replace(",", ""))
            except Exception:
                return float("nan")
        return float("nan")

    def find_col(cands):
        def norm(s):
            return str(s).lower().replace(" ", "").replace("_", "")
        ncols = [(c, norm(c)) for c in cols]
        for k in cands:
            nk = norm(k)
            for c, nc in ncols:
                if nk in nc:
                    return c
        return None

    # Pre-detect some columns
    demand_col = find_col(["demand"]) or None
    supply_col = find_col(["supply"]) or None
    class_col = find_col(["demand/supply", "demandandsupply", "type", "category"]) or None
    start_col = find_col(["fpfv", "start", "firstpatientfirstvisit"]) or None
    end_col = find_col(["dbl", "lplv", "complete", "end"]) or None

    # Helpers
    def total(col):
        if not col:
            return None
        s = 0.0
        for r in rows:
            v = num(r.get(col))
            if not (v != v):  # not NaN
                s += v
        return s

    def util_rate():
        d = total(demand_col)
        s = total(supply_col)
        if d and d > 0 and s is not None:
            return 100.0 * s / d
        return None

    def timeline():
        import datetime as dt
        def parse(v):
            try:
                return dt.datetime.fromisoformat(str(v))
            except Exception:
                return None
        starts = [parse(r.get(start_col)) for r in rows] if start_col else []
        ends = [parse(r.get(end_col)) for r in rows] if end_col else []
        starts = [d for d in starts if d]
        ends = [d for d in ends if d]
        return (min(starts).date().isoformat() if starts else None, max(ends).date().isoformat() if ends else None)

    # Simple intent routing
    if "help" in q or "what can" in q:
        return {"answer": "I can answer quick questions about columns, row counts, demand vs supply totals, utilization, and basic timelines from the preview rows. Try: 'what columns do we have?' or 'total demand vs supply' or 'utilization rate'."}

    if "column" in q or "schema" in q:
        return {"answer": f"Columns: {', '.join(cols) if cols else 'No columns provided'}"}

    if "row" in q and ("how many" in q or "count" in q or "total" in q):
        return {"answer": f"Row count: {req.row_count if req.row_count is not None else len(rows)}"}

    if ("demand" in q and "supply" in q) or ("demand vs supply" in q):
        td = total(demand_col)
        ts = total(supply_col)
        if td is not None or ts is not None:
            return {"answer": f"Preview totals — Demand: {td or 0:.2f}, Supply: {ts or 0:.2f}"}
        if class_col:
            d = s = o = 0
            for r in rows:
                v = str(r.get(class_col, "")).lower()
                if "demand" in v: d += 1
                elif "supply" in v: s += 1
                else: o += 1
            return {"answer": f"Counts — Demand: {d}, Supply: {s}, Other: {o}"}
        return {"answer": "Could not detect demand/supply columns from the preview."}

    if "utilization" in q or ("rate" in q and "util" in q):
        u = util_rate()
        if u is not None:
            return {"answer": f"Preview utilization rate: {u:.1f}% (Supply/Demand * 100)."}
        return {"answer": "I need numeric 'demand' and 'supply' columns to calculate utilization."}

    if "timeline" in q or ("earliest" in q or "latest" in q or "start" in q or "end" in q):
        start, end = timeline()
        if start or end:
            return {"answer": f"Timeline from preview — Earliest start: {start or 'n/a'}, Latest end: {end or 'n/a'}."}
        return {"answer": "No recognizable date columns (FPFV/DBL/LPLV) found in the preview."}

    if "forecast" in q or "timeseries" in q:
        ts = req.timeseries or {}
        labels = ts.get("labels", [])
        return {"answer": f"I have {len(labels)} time points in the series."}

    # Default fallback
    return {"answer": "Sorry, I didn't catch that. Try asking about columns, row count, demand vs supply totals, utilization rate, or timeline."}


class MetricsRequest(BaseModel):
    project: str | None = None
    trial: str | None = None
    area: str | None = None
    phase: str | None = None
    quarter: str | None = None  # e.g., "Q1 2025"
    augmented: bool = False     # include synthetic rows when aggregating


@app.post("/metrics")
async def metrics(req: MetricsRequest):
    if LAST_DATA.get("df") is None:
        raise HTTPException(status_code=400, detail="No dataset uploaded yet")
    df = (LAST_DATA.get("df_aug") if req.augmented and LAST_DATA.get("df_aug") is not None else LAST_DATA["df"]).copy()
    project_col = LAST_DATA.get("project_col")
    trial_col = LAST_DATA.get("trial_col")
    area_col = LAST_DATA.get("area_col")
    phase_col = LAST_DATA.get("phase_col")
    demand_col = LAST_DATA.get("demand_col")
    supply_col = LAST_DATA.get("supply_col")
    quarter_cols = LAST_DATA.get("quarter_cols", [])

    # Apply filters
    if req.project and project_col in df.columns:
        df = df[df[project_col].astype(str) == str(req.project)]
    if req.trial and trial_col in df.columns:
        df = df[df[trial_col].astype(str) == str(req.trial)]
    if req.area and area_col in df.columns:
        df = df[df[area_col].astype(str) == str(req.area)]
    if req.phase and phase_col in df.columns:
        df = df[df[phase_col].astype(str) == str(req.phase)]

    def to_num(x):
        try:
            if pd.isna(x):
                return np.nan
        except Exception:
            pass
        if isinstance(x, (int, float, np.floating, np.integer)):
            return float(x)
        if isinstance(x, str):
            try:
                return float(x.replace(",", ""))
            except Exception:
                return np.nan
        return np.nan

    # Aggregate across quarter columns for estimate/demand/supply
    agg: dict[tuple[int,int], dict[str, float]] = {}
    import re as _re
    for col, y, q, kind in quarter_cols:
        if col not in df.columns:
            continue
        vals = df[col].map(to_num).fillna(0)
        key = (y, q)
        if key not in agg:
            agg[key] = {"estimate": 0.0, "demand": 0.0, "supply": 0.0}
        if kind in agg[key]:
            agg[key][kind] += float(vals.sum())

    keys = sorted(agg.keys())
    labels = [f"Q{q} {y}" for (y, q) in keys]
    estimate = [round(float(agg[k]["estimate"]) if math.isfinite(float(agg[k]["estimate"])) else 0.0, 3) for k in keys]
    demand = [round(float(agg[k]["demand"]) if math.isfinite(float(agg[k]["demand"])) else 0.0, 3) for k in keys]
    supply = [round(float(agg[k]["supply"]) if math.isfinite(float(agg[k]["supply"])) else 0.0, 3) for k in keys]
    if not any(supply) and any(estimate):
        supply = estimate[:]

    # Totals
    total_demand = float(np.nansum(demand)) if demand else None
    total_supply = float(np.nansum(supply)) if supply else None

    # Quarter slice if requested
    if req.quarter and req.quarter in labels:
        i = labels.index(req.quarter)
        total_demand = float(demand[i])
        total_supply = float(supply[i])

    # Bottlenecks from quarter cols: sum row totals
    demand_cols = [c for c, y, q, kind in quarter_cols if kind == "demand" and c in df.columns]
    estimate_cols = [c for c, y, q, kind in quarter_cols if kind == "estimate" and c in df.columns]
    bn = None
    if demand_cols and estimate_cols:
        row_d = df[demand_cols].applymap(to_num).fillna(0).sum(axis=1)
        row_e = df[estimate_cols].applymap(to_num).fillna(0).sum(axis=1)
        gaps = row_d - row_e
        bn = int((gaps > 0).sum())

    # Forecast at least next 4 quarters (1 year). Use Holt-Winters if available; fallback to moving average.
    forecast_obj = None
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
        base = demand if any(demand) else estimate
        if len(base) >= 6:
            seasonal_periods = 4
            model = ExponentialSmoothing(base, trend='add', seasonal='add', seasonal_periods=seasonal_periods)
            fit = model.fit(optimized=True)
            # steps to reach end of 2031 from the last known label
            target_year = 2031
            if labels:
                m_last = re.match(r"Q(\d)\s+(\d{4})", labels[-1])
                q_last = int(m_last.group(1)) if m_last else 4
                y_last = int(m_last.group(2)) if m_last else 2030
            else:
                q_last, y_last = 4, 2030
            to_2031 = max(0, (target_year - y_last) * 4 + (4 - q_last))
            steps = max(8, to_2031)
            fvals = fit.forecast(steps)
            resid = np.array(base) - fit.fittedvalues
            sigma = float(np.nanstd(resid)) if resid.size else 0.0
            lower = [float(v - 1.96 * sigma) for v in fvals]
            upper = [float(v + 1.96 * sigma) for v in fvals]
            # Extend labels
            if labels:
                last = labels[-1]
                m = re.match(r"Q(\d)\s+(\d{4})", last)
                q = int(m.group(1)) if m else 4
                y = int(m.group(2)) if m else 2030
            else:
                q, y = 4, 2030
            flabels = []
            for _ in range(len(fvals)):
                q += 1
                if q > 4:
                    q = 1
                    y += 1
                flabels.append(f"Q{q} {y}")
            forecast_obj = {"labels": flabels, "values": [float(v) for v in fvals], "ci": {"lower": lower, "upper": upper}}
    except Exception:
        # simple moving average fallback
        base = demand if any(demand) else estimate
        if base:
            window = min(4, len(base))
            avg = float(np.nanmean(base[-window:]))
            flabels = []
            if labels:
                last = labels[-1]
                m = re.match(r"Q(\d)\s+(\d{4})", last)
                q = int(m.group(1)) if m else 4
                y = int(m.group(2)) if m else 2030
            else:
                q, y = 4, 2030
            for _ in range(4):
                q += 1
                if q > 4:
                    q = 1
                    y += 1
                flabels.append(f"Q{q} {y}")
            forecast_obj = {"labels": flabels, "values": [avg]*4, "ci": {"lower": [avg*0.9]*4, "upper": [avg*1.1]*4}}

    return jsonable_encoder({
        "metrics": {
            "total_demand": total_demand,
            "total_supply": total_supply,
            "utilization_rate": (float(total_supply)/float(total_demand)*100.0) if (total_supply and total_demand) else None,
            "bottlenecks": bn,
        },
        "timeseries": {
            "labels": labels,
            "estimate": estimate,
            "demand": demand,
            "supply": supply,
            "forecast": forecast_obj,
        }
    })


def compute_training(augmented: bool, horizon: int = 8) -> dict:
    if LAST_DATA.get("df") is None:
        raise ValueError("No dataset uploaded yet")
    df_source = LAST_DATA.get("df_aug") if augmented and LAST_DATA.get("df_aug") is not None else LAST_DATA.get("df")
    if df_source is None:
        raise ValueError("Augmented dataset not available")
    df = df_source.copy()
    quarter_cols = LAST_DATA.get("quarter_cols", [])
    if not quarter_cols:
        raise ValueError("No quarter columns detected for timeseries training")

    def to_num(x):
        try:
            if pd.isna(x):
                return np.nan
        except Exception:
            pass
        if isinstance(x, (int, float, np.floating, np.integer)):
            return float(x)
        if isinstance(x, str):
            try:
                return float(x.replace(",", ""))
            except Exception:
                return np.nan
        return np.nan

    agg: dict[tuple[int, int], dict[str, float]] = {}
    for col, y, q, kind in quarter_cols:
        if col not in df.columns:
            continue
        vals = df[col].map(to_num).fillna(0)
        key = (y, q)
        if key not in agg:
            agg[key] = {"estimate": 0.0, "demand": 0.0, "supply": 0.0}
        if kind in agg[key]:
            agg[key][kind] += float(vals.sum())

    keys = sorted(agg.keys())
    labels = [f"Q{q} {y}" for (y, q) in keys]
    estimate = [float(agg[k]["estimate"]) for k in keys]
    demand = [float(agg[k]["demand"]) for k in keys]
    base = demand if any(demand) else estimate
    if len(base) < 8:
        raise ValueError("Not enough points for train/test split (need >= 8 quarters)")

    test_h = 4 if len(base) >= 12 else max(2, len(base) // 5)
    train = np.array(base[:-test_h], dtype=float)
    test = np.array(base[-test_h:], dtype=float)

    model_name = 'Holt–Winters (additive)'
    try:
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
        seasonal_periods = 4
        model = ExponentialSmoothing(train, trend='add', seasonal='add', seasonal_periods=seasonal_periods)
        fit = model.fit(optimized=True)
        pred_test = np.array(fit.forecast(test_h), dtype=float)
    except Exception:
        pred_test = np.array([train[-1]] * test_h, dtype=float)
        model_name = 'Moving Average (fallback)'
        fit = None

    def mae(y, yhat):
        return float(np.nanmean(np.abs(y - yhat)))
    def rmse(y, yhat):
        return float(np.sqrt(np.nanmean((y - yhat)**2)))
    def mape(y, yhat):
        y_safe = np.where(np.abs(y) < 1e-8, 1.0, np.abs(y))
        return float(np.nanmean(np.abs((y - yhat) / y_safe)) * 100.0)
    def r2(y, yhat):
        ss_res = np.nansum((y - yhat)**2)
        ss_tot = np.nansum((y - np.nanmean(y))**2)
        return float(1.0 - ss_res/ss_tot) if ss_tot > 0 else None

    metrics_model = {
        "mae": mae(test, pred_test),
        "rmse": rmse(test, pred_test),
        "mape": mape(test, pred_test),
        "r2": r2(test, pred_test),
    }

    baseline = np.array([train[-1]] * test_h, dtype=float)
    metrics_baseline = {
        "mae": mae(test, baseline),
        "rmse": rmse(test, baseline),
        "mape": mape(test, baseline),
        "r2": r2(test, baseline),
    }

    target_year = 2031
    last = labels[-1]
    m = re.match(r"Q(\d)\s+(\d{4})", last)
    q = int(m.group(1)) if m else 4
    y = int(m.group(2)) if m else 2030
    to_2031 = max(0, (target_year - y) * 4 + (4 - q))
    steps = max(horizon, to_2031)
    try:
        if fit is None:
            raise RuntimeError("HW model not available")
        future = np.array(fit.forecast(steps), dtype=float)
    except Exception:
        avg = float(np.nanmean(train[-min(4, len(train)):]))
        future = np.array([avg] * steps, dtype=float)

    flabels = []
    for _ in range(steps):
        q += 1
        if q > 4:
            q = 1
            y += 1
        flabels.append(f"Q{q} {y}")

    real_df = LAST_DATA.get("df")
    aug_df = LAST_DATA.get("df_aug")
    real_rows = int(len(real_df)) if real_df is not None else 0
    aug_rows = int(len(aug_df)) if aug_df is not None else 0

    return {
        "rows": {"real": real_rows, "augmented": aug_rows},
        "series": {"labels": labels, "base": list(base), "train_size": int(len(train)), "test_size": int(len(test))},
        "pred": {"test_labels": list(labels[-test_h:]), "test_actual": list(test), "test_pred": list(pred_test)},
        "metrics": {"model": metrics_model, "baseline": metrics_baseline, "name": model_name},
        "forecast": {"labels": flabels, "values": future.tolist()}
    }


def store_training_result(augmented: bool, horizon: int = 8) -> dict:
    key = 'augmented' if augmented else 'real'
    LAST_TRAINING[key] = {
        "status": "running",
        "timestamp": datetime.utcnow().isoformat() + 'Z',
        "augmented": augmented,
        "result": None,
        "error": None,
        "horizon": horizon,
    }
    try:
        result = compute_training(augmented, horizon)
        record = {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat() + 'Z',
            "augmented": augmented,
            "result": result,
            "error": None,
            "horizon": horizon,
        }
        LAST_TRAINING[key] = record
        return record
    except Exception as exc:
        record = {
            "status": "error",
            "timestamp": datetime.utcnow().isoformat() + 'Z',
            "augmented": augmented,
            "result": None,
            "error": str(exc),
            "horizon": horizon,
        }
        LAST_TRAINING[key] = record
        return record

class TrainRequest(BaseModel):
    augmented: bool = True
    horizon: int = 8  # quarters to forecast (>= to cover up to 2031 automatically)


@app.post("/train")
async def train(req: TrainRequest):
    try:
        record = store_training_result(req.augmented, req.horizon)
        if record.get("status") != "ok":
            raise ValueError(record.get("error") or "Training failed")
        return jsonable_encoder(record.get("result"))
    except Exception as exc:
        key = 'augmented' if req.augmented else 'real'
        LAST_TRAINING[key] = {
            "status": "error",
            "timestamp": datetime.utcnow().isoformat() + 'Z',
            "augmented": req.augmented,
            "result": None,
            "error": str(exc),
            "horizon": req.horizon,
        }
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/training/results")
async def training_results():
    return jsonable_encoder({
        "real": LAST_TRAINING.get("real"),
        "augmented": LAST_TRAINING.get("augmented"),
    })
async def training_results():
    return jsonable_encoder({
        "real": LAST_TRAINING.get("real"),
        "augmented": LAST_TRAINING.get("augmented"),
    })
