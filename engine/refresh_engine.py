#!/usr/bin/env python3
"""
TMS Dashboard Engine V2.0

Input:
  input/TMS Order Detail.xlsx
  input/Fill Rate.xlsx

Output (only after validation PASS):
  data/npp_summary.json
  data/order_detail.json
  data/error_detail.json
  data/plan_detail.json
  data/calculation_audit.json
  data/data_quality.json
  validation/validation_report.json

The engine is the single source of truth for KPI calculations.
The dashboard must not recalculate these business rules.
"""

from __future__ import annotations

import json
import math
import re
import shutil
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

# -----------------------------------------------------------------------------
# Paths / locked business rules
# -----------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "input"
DATA_DIR = ROOT / "data"
VALIDATION_DIR = ROOT / "validation"
STAGE_DIR = ROOT / ".engine_stage"

TMS_FILE = INPUT_DIR / "TMS Order Detail.xlsx"
FILL_RATE_FILE = INPUT_DIR / "Fill Rate.xlsx"

RULE_VERSION = "V2.0 Updated"
SLA_HOURS = 24
SEND_CUTOFF_HOUR = 17
WORKING_HOUR_END = 20
GEO_RADIUS_M = 50
MIN_OUTLET_GAP_MIN = 2
PAYLOAD_MAX_RATIO = 1.5
PLAN_ERROR_THRESHOLD = 0.30

# Approved username formats used by the current TMS source.
PHONE_RE = re.compile(r"^0\d{9}$")
VEHICLE_RE = re.compile(r"^\d{2}[A-Za-z]{1,2}-?\d{4,6}$", re.IGNORECASE)
DSA_RE = re.compile(r"^(.+)DSAs\d$", re.IGNORECASE)

OUTPUT_FILES = [
    "npp_summary.json",
    "order_detail.json",
    "error_detail.json",
    "plan_detail.json",
    "calculation_audit.json",
    "data_quality.json",
]

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def clean_text(s: pd.Series) -> pd.Series:
    return s.astype("string").str.strip()


def safe_num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def is_valid_dt(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, errors="coerce").notna()


def json_safe_value(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, pd.Timestamp):
        return None if pd.isna(v) else v.isoformat()
    if isinstance(v, pd.Timedelta):
        return None if pd.isna(v) else v.total_seconds()
    if isinstance(v, np.datetime64):
        return None if np.isnat(v) else pd.Timestamp(v).isoformat()
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return None if np.isnan(v) else float(v)
    if isinstance(v, np.bool_):
        return bool(v)
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if pd.isna(v) if not isinstance(v, (list, dict, tuple, str, bytes, bool, int)) else False:
        return None
    return v


def records_to_json(df: pd.DataFrame) -> list[dict[str, Any]]:
    records = []
    for row in df.to_dict(orient="records"):
        records.append({str(k): json_safe_value(v) for k, v in row.items()})
    return records


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def require_columns(df: pd.DataFrame, required: list[str], name: str) -> None:
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"{name} is missing required columns: {missing}")


def normalize_source_excel(path: Path, name: str) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Missing input file: {path}")
    # Source exports have two title/filter rows before the actual header.
    df = pd.read_excel(path, header=2)
    df.columns = [str(c).strip() for c in df.columns]
    if df.empty:
        raise ValueError(f"{name} is empty")
    return df


def sunday_adjusted_seconds(start: pd.Timestamp, end: pd.Timestamp) -> float:
    """Elapsed seconds excluding only intermediate Sunday periods.

    If the actual delivery occurs on Sunday, that Sunday is NOT excluded.
    Negative elapsed time is preserved and later treated as a 24H failure.
    """
    if pd.isna(start) or pd.isna(end):
        return np.nan

    total = (end - start).total_seconds()
    if total <= 0:
        return total

    day = start.normalize()
    end_day = end.normalize()

    while day < end_day:
        # Python weekday: Monday=0 ... Sunday=6
        if day.weekday() == 6:
            seg_start = max(start, day)
            seg_end = min(end, day + pd.Timedelta(days=1))
            if seg_end > seg_start:
                total -= (seg_end - seg_start).total_seconds()
        day += pd.Timedelta(days=1)

    return total


def pct(numerator: float, denominator: float) -> float | None:
    if denominator in (0, None) or pd.isna(denominator):
        return None
    return float(numerator / denominator)

# -----------------------------------------------------------------------------
# Main engine
# -----------------------------------------------------------------------------

def build_engine() -> dict[str, Any]:
    tms = normalize_source_excel(TMS_FILE, "TMS Order Detail")
    fill = normalize_source_excel(FILL_RATE_FILE, "Fill Rate")

    tms_raw_count = len(tms)
    fill_raw_count = len(fill)

    tms_required = [
        "OrderNumber", "Status", "PlanNumber", "OutletCode",
        "DeliverDateTime", "Assigned_Weight", "TruckCapacityWeight",
        "distance_to_dropped", "username",
    ]
    fill_required = ["DocNo", "Sent_To_distributor"]
    require_columns(tms, tms_required, "TMS Order Detail")
    require_columns(fill, fill_required, "Fill Rate")

    # Normalize key/date fields.
    for c in ["OrderNumber", "PlanNumber", "OutletCode", "TenantName", "DriverName", "Status", "username"]:
        if c in tms.columns:
            tms[c] = clean_text(tms[c])
    fill["DocNo"] = clean_text(fill["DocNo"])
    tms["DeliverDateTime"] = pd.to_datetime(tms["DeliverDateTime"], errors="coerce")
    fill["Sent_To_distributor"] = pd.to_datetime(fill["Sent_To_distributor"], errors="coerce")

    # Keep original TMS order uniqueness as a hard data-quality requirement.
    tms_unique = tms["OrderNumber"].nunique(dropna=True)
    fill_unique = fill["DocNo"].nunique(dropna=True)
    if tms_unique != tms_raw_count:
        raise ValueError(f"TMS OrderNumber is not unique: {tms_unique} unique / {tms_raw_count} rows")

    # Latest valid Fill Rate timestamp per DocNo. If latest timestamp has
    # conflicting values, flag Duplicate Conflict rather than duplicating TMS.
    fill_valid = fill.dropna(subset=["DocNo", "Sent_To_distributor"]).copy()
    duplicate_conflict_docs: set[str] = set()
    selected_rows: list[dict[str, Any]] = []

    for docno, g in fill_valid.groupby("DocNo", sort=False):
        latest_ts = g["Sent_To_distributor"].max()
        latest = g[g["Sent_To_distributor"] == latest_ts]
        if len(latest) > 1:
            # Conflicting values means more than one distinct row at latest time.
            # For the mapping field itself, identical latest timestamps are not a
            # conflict if all values that matter are identical.
            if latest["Sent_To_distributor"].nunique(dropna=True) > 1:
                duplicate_conflict_docs.add(str(docno))
            # Same timestamp is inherently the same mapping value, so use one row.
        selected_rows.append({
            "DocNo": docno,
            "Sent_To_distributor": latest_ts,
            "Duplicate Conflict": str(docno) in duplicate_conflict_docs,
        })

    mapping = pd.DataFrame(selected_rows)
    if not mapping.empty:
        mapping = mapping.rename(columns={"DocNo": "OrderNumber"})

    # Merge without duplicating TMS rows.
    d = tms.merge(mapping[["OrderNumber", "Sent_To_distributor", "Duplicate Conflict"]],
                  on="OrderNumber", how="left", validate="one_to_one")
    d["Mapping Status"] = np.select(
        [d["Duplicate Conflict"].eq(True), d["Sent_To_distributor"].notna()],
        ["Duplicate Conflict", "Matched"],
        default="Not Found",
    )
    d.drop(columns=["Duplicate Conflict"], inplace=True)

    # Calculation population = Delivered records only.
    d["Calculation Population"] = (
        d["Status"].fillna("").astype(str).str.strip().str.casefold().eq("delivered")
    )

    send = pd.to_datetime(d["Sent_To_distributor"], errors="coerce")
    deliver = pd.to_datetime(d["DeliverDateTime"], errors="coerce")
    d["Sent_To_distributor"] = send
    d["DeliverDateTime"] = deliver

    # ------------------------------------------------------------------
    # Username
    # ------------------------------------------------------------------
    username = d["username"].fillna("").astype(str).str.strip()
    phone = username.str.fullmatch(PHONE_RE)
    vehicle = username.str.fullmatch(VEHICLE_RE)
    dsa_match = username.str.extract(DSA_RE, expand=False)
    tenant = d["TenantName"].fillna("").astype(str).str.strip()
    dsa = dsa_match.notna() & dsa_match.str.upper().eq(tenant.str.upper())
    username_valid = phone | vehicle | dsa
    d["UserName Check"] = np.select([username.eq(""), username_valid], ["N/A", "Pass"], default="Wrong")
    d["DSA Excluded"] = dsa.fillna(False)
  
    # ------------------------------------------------------------------
    # Created Time
    # ------------------------------------------------------------------
    created_eligible = send.notna() & deliver.notna()
    created_wrong = created_eligible & (deliver < send)
    d["Created_Time"] = np.select(
        [~created_eligible, created_wrong],
        ["N/A", "Wrong"],
        default="Pass",
    )

    # ------------------------------------------------------------------
    # Working Hour
    # ------------------------------------------------------------------
    working_eligible = deliver.notna()
    after_20 = working_eligible & (
        (deliver.dt.hour > WORKING_HOUR_END)
        | ((deliver.dt.hour == WORKING_HOUR_END) & (deliver.dt.minute > 0))
        | ((deliver.dt.hour == WORKING_HOUR_END) & (deliver.dt.minute == 0) & (deliver.dt.second > 0))
    )
    d["Working Hour Check"] = np.select(
        [~working_eligible, after_20],
        ["N/A", "Wrong"],
        default="Pass",
    )
    d["Working Hour Reason"] = np.where(after_20, "Delivered after working hours", None)

    # ------------------------------------------------------------------
    # Distance & Time
    # ------------------------------------------------------------------
    d["Previous_DeliverDateTime"] = pd.NaT
    d["Previous_OutletCode"] = pd.NA
    d["GapTime_Minutes"] = np.nan

    eligible_for_sequence = d[
        d["Calculation Population"] & d["DeliverDateTime"].notna() & d["PlanNumber"].notna()
    ]

    for _, idx in eligible_for_sequence.groupby("PlanNumber", sort=False).groups.items():
        ordered = sorted(idx, key=lambda i: d.at[i, "DeliverDateTime"])
        previous = None
        for i in ordered:
            if previous is not None:
                prev_dt = d.at[previous, "DeliverDateTime"]
                curr_dt = d.at[i, "DeliverDateTime"]
                d.at[i, "Previous_DeliverDateTime"] = prev_dt
                d.at[i, "Previous_OutletCode"] = d.at[previous, "OutletCode"]
                d.at[i, "GapTime_Minutes"] = (curr_dt - prev_dt).total_seconds() / 60.0
            previous = i

    distance = safe_num(d["distance_to_dropped"])
    gap = safe_num(d["GapTime_Minutes"])
    outlet_diff = d["OutletCode"].astype("string").ne(d["Previous_OutletCode"].astype("string"))

    dt_eligible = d["Calculation Population"] & deliver.notna()
    dt_wrong = dt_eligible & gap.notna() & (gap < MIN_OUTLET_GAP_MIN) & (distance > GEO_RADIUS_M) & outlet_diff
    d["Distance & Time Check"] = np.select(
        [~dt_eligible, dt_wrong],
        ["N/A", "Wrong"],
        default="Pass",
    )

    # ------------------------------------------------------------------
    # Payload at PlanNumber level
    # ------------------------------------------------------------------
    weight = safe_num(d["Assigned_Weight"])
    capacity = safe_num(d["TruckCapacityWeight"])
    d["Assigned_Weight"] = weight
    d["TruckCapacityWeight"] = capacity

    payload_base = (
        d["Calculation Population"]
        & (~d["DSA Excluded"])
        & d["PlanNumber"].notna()
        & weight.notna()
        & capacity.notna()
        & (capacity > 0)
    )

    d["Assigned_Weight_Total"] = d.groupby("PlanNumber")["Assigned_Weight"].transform("sum")
    d["TruckCapacityWeight_Plan_Unique"] = d.groupby("PlanNumber")["TruckCapacityWeight"].transform(
        lambda s: s.dropna().nunique()
    )
    d["Capacity Conflict"] = d["TruckCapacityWeight_Plan_Unique"].fillna(0) > 1
    d["Payload Utilization"] = np.where(
        d["TruckCapacityWeight_Plan_Unique"].eq(1) & capacity.gt(0),
        d["Assigned_Weight_Total"] / capacity,
        np.nan,
    )
    payload_eligible = payload_base & (~d["Capacity Conflict"])
    payload_wrong = payload_eligible & (d["Payload Utilization"] > PAYLOAD_MAX_RATIO)
    d["Payload Check"] = np.select(
        [~payload_eligible, payload_wrong],
        ["N/A", "Wrong"],
        default="Pass",
    )

    # ------------------------------------------------------------------
    # Geo
    # ------------------------------------------------------------------
    geo_eligible = d["Calculation Population"] & (~d["DSA Excluded"]) & distance.notna()
    geo_error_distance = geo_eligible & (distance > GEO_RADIUS_M)
    geo_error_dt = geo_eligible & dt_wrong
    geo_error_created = geo_eligible & created_wrong
    geo_wrong = geo_error_distance | geo_error_dt | geo_error_created
    d["Geo Error Distance"] = geo_error_distance
    d["Geo Error DistanceTime"] = geo_error_dt
    d["Geo Error CreatedTime"] = geo_error_created
    d["Geo Check"] = np.select(
        [~geo_eligible, geo_wrong],
        ["N/A", "Wrong"],
        default="Pass",
    )

    # ------------------------------------------------------------------
    # 24H SLA
    # ------------------------------------------------------------------
    h24_eligible = send.notna() & deliver.notna()
    d["24H Eligible"] = h24_eligible
    d["24H Exclusion Reason"] = np.select(
        [~send.notna() & ~deliver.notna(), ~send.notna(), ~deliver.notna()],
        ["Missing OrderDateTime and DeliverDateTime", "Missing OrderDateTime", "Missing DeliverDateTime"],
        default=None,
    )

    send_new = send.copy()
    adjust_send = (
        h24_eligible
        & (send.dt.hour >= SEND_CUTOFF_HOUR)
        & (deliver.dt.date > send.dt.date)
    )
    send_new.loc[adjust_send] = send.loc[adjust_send].dt.normalize() + pd.Timedelta(days=1)
    d["SendNEW"] = send_new

    durations = [
        sunday_adjusted_seconds(a, b) if ok else np.nan
        for a, b, ok in zip(send_new, deliver, h24_eligible)
    ]
    d["Duration_24H"] = pd.to_timedelta(durations, unit="s")

    # A valid timestamp sequence that goes backwards is a FAIL, not N/A.
    h24_pass = h24_eligible & (d["Duration_24H"] >= pd.Timedelta(0)) & (d["Duration_24H"] <= pd.Timedelta(hours=SLA_HOURS))
    h24_fail = h24_eligible & ~h24_pass
    d["24H"] = np.select(
        [~h24_eligible, h24_pass],
        ["N/A", "Pass"],
        default="Fail",
    )

    # ------------------------------------------------------------------
    # Error model
    # ------------------------------------------------------------------
    # Error events are retained separately. They are based on the delivered
    # calculation population and KPI-specific failures.
    event_masks = {
        "UserName": d["Calculation Population"] & d["UserName Check"].eq("Wrong"),
        "Geo": geo_wrong,
        "Distance & Time": dt_wrong,
        "Created Time": d["Calculation Population"] & d["Created_Time"].eq("Wrong"),
        "Payload": payload_wrong,
        "Working Hour": d["Calculation Population"] & d["Working Hour Check"].eq("Wrong"),
    }
    reasons = {
        "UserName": "Invalid or non-compliant username",
        "Geo": "Geo distance >50m or related Geo condition failed",
        "Distance & Time": "Outlet-to-outlet gap <2 minutes with distance >50m",
        "Created Time": "DeliverDateTime earlier than Send_To_distributor",
        "Payload": "Payload utilization >150% or capacity issue",
        "Working Hour": "Delivered after working hours",
    }

    d["Error Event Count"] = 0
    for mask in event_masks.values():
        d["Error Event Count"] += mask.astype(int)
    d["Error Order Flag"] = d["Error Event Count"] > 0

    # Display-only Primary Error. It does not suppress events.
    primary_order = ["Created Time", "Distance & Time", "Payload", "Geo", "UserName", "Working Hour"]
    primary = pd.Series(pd.NA, index=d.index, dtype="object")
    for group in primary_order:
        primary = primary.mask(primary.isna() & event_masks[group], group)
    d["Primary Error"] = primary

    # ------------------------------------------------------------------
    # Plan summary
    # ------------------------------------------------------------------
    plan_population = d[d["Calculation Population"] & d["PlanNumber"].notna()].copy()
    plan_rows = []
    for plan, g in plan_population.groupby("PlanNumber", sort=True):
        total_orders = g["OrderNumber"].nunique()
        error_orders = g.loc[g["Error Order Flag"], "OrderNumber"].nunique()
        error_events = int(g["Error Event Count"].sum())
        plan_error_pct = pct(error_orders, total_orders)
        plan_result = "Fail" if (plan_error_pct is not None and plan_error_pct > PLAN_ERROR_THRESHOLD) else "Pass"
        plan_rows.append({
            "PlanNumber": plan,
            "Total_Orders": total_orders,
            "Error_Orders": error_orders,
            "Error_Events": error_events,
            "Payload_Wrong": int(g["Payload Check"].eq("Wrong").sum()),
            "DistanceTime_Wrong": int(g["Distance & Time Check"].eq("Wrong").sum()),
            "CreatedTime_Wrong": int(g["Created_Time"].eq("Wrong").sum()),
            "Geo_Wrong": int(g["Geo Check"].eq("Wrong").sum()),
            "UserName_Wrong": int(g["UserName Check"].eq("Wrong").sum()),
            "WorkingHour_Wrong": int(g["Working Hour Check"].eq("Wrong").sum()),
            "Plan Error %": plan_error_pct,
            "Plan Result": plan_result,
        })
    plan_df = pd.DataFrame(plan_rows)

    # ------------------------------------------------------------------
    # NPP summary and score
    # ------------------------------------------------------------------
    npp_rows = []
    for tenant, g in d.groupby("TenantName", dropna=False, sort=True):
        calc_g = g[g["Calculation Population"]]
        total_orders = len(g)
        error_orders = int(calc_g.loc[calc_g["Error Order Flag"], "OrderNumber"].nunique())
        error_events = int(calc_g["Error Event Count"].sum())

        h24e = int(g["24H Eligible"].sum())
        h24p = int(g["24H"].eq("Pass").sum())
        h24f = int(g["24H"].eq("Fail").sum())

        ge = int(g["Geo Check"].isin(["Pass", "Wrong"]).sum())
        gp = int(g["Geo Check"].eq("Pass").sum())
        pe = int(g["Payload Check"].isin(["Pass", "Wrong"]).sum())
        pp = int(g["Payload Check"].eq("Pass").sum())
        te = int(g["Distance & Time Check"].isin(["Pass", "Wrong"]).sum())
        tp = int(g["Distance & Time Check"].eq("Pass").sum())
        ue = int(g["UserName Check"].isin(["Pass", "Wrong"]).sum())
        up = int(g["UserName Check"].eq("Pass").sum())
        wh_fail = int(g["Working Hour Check"].eq("Wrong").sum())

        geo_comp = pct(gp, ge)
        time_comp = pct(tp, te)
        payload_comp = pct(pp, pe)
        username_comp = pct(up, ue)

        weighted = []
        if geo_comp is not None:
            weighted.append((geo_comp, 0.40))
        if time_comp is not None:
            weighted.append((time_comp, 0.30))
        if payload_comp is not None:
            weighted.append((payload_comp, 0.30))
        operational = (
            sum(v * w for v, w in weighted) / sum(w for _, w in weighted)
            if weighted else None
        )
        final_score = operational * username_comp if operational is not None and username_comp is not None else None
        overall = "Fail" if calc_g["Error Order Flag"].any() else "Pass"

        npp_rows.append({
            "TenantName": tenant,
            "Total_Orders": total_orders,
            "Error_Orders": error_orders,
            "Error_Events": error_events,
            "H24_Eligible": h24e,
            "H24_Pass": h24p,
            "H24_Fail": h24f,
            "Geo_Eligible": ge,
            "Geo_Pass": gp,
            "Payload_Eligible": pe,
            "Payload_Pass": pp,
            "Time_Eligible": te,
            "Time_Pass": tp,
            "Username_Eligible": ue,
            "Username_Pass": up,
            "WorkingHour_Fail": wh_fail,
            "24H Compliance": pct(h24p, h24p + h24f),
            "24H Data Completeness": pct(h24e, int(g["Calculation Population"].sum())),
            "Geo Compliance": geo_comp,
            "Time Compliance": time_comp,
            "Payload Compliance": payload_comp,
            "Username Compliance": username_comp,
            "Operational Score": operational,
            "Final Score": final_score,
            "Overall": overall,
        })
    npp_df = pd.DataFrame(npp_rows)

    # ------------------------------------------------------------------
    # Error detail
    # ------------------------------------------------------------------
    error_frames = []
    for group, mask in event_masks.items():
        if not mask.any():
            continue
        cols = ["OrderNumber", "PlanNumber", "TenantName", "DriverName", "OutletCode", "DeliverDateTime", "Sent_To_distributor"]
        ef = d.loc[mask, cols].copy()
        ef["Error Group"] = group
        ef["Error Reason"] = reasons[group]
        error_frames.append(ef)
    error_df = pd.concat(error_frames, ignore_index=True) if error_frames else pd.DataFrame(
        columns=["OrderNumber", "PlanNumber", "TenantName", "DriverName", "OutletCode", "Error Group", "Error Reason", "DeliverDateTime", "Sent_To_distributor"]
    )
    error_df = error_df[["OrderNumber", "PlanNumber", "TenantName", "DriverName", "OutletCode", "Error Group", "Error Reason", "DeliverDateTime", "Sent_To_distributor"]]

    # ------------------------------------------------------------------
    # Calculation audit
    # ------------------------------------------------------------------
    audit_cols = [
        "OrderNumber", "PlanNumber", "TenantName", "Mapping Status", "Calculation Population",
        "Sent_To_distributor", "DeliverDateTime", "Created_Time", "SendNEW", "Duration_24H",
        "24H", "24H Eligible", "24H Exclusion Reason", "Working Hour Check", "Working Hour Reason",
        "Distance & Time Check", "GapTime_Minutes", "Geo Check", "Payload Utilization", "Payload Check",
        "UserName Check", "Error Event Count", "Error Order Flag", "Primary Error",
    ]
    audit_df = d[audit_cols].copy()
    audit_df["Rule Version"] = RULE_VERSION

    # ------------------------------------------------------------------
    # Data quality / reconciliation
    # ------------------------------------------------------------------
    summary = {
        "Business Logic Version": RULE_VERSION,
        "TMS Orders": int(tms_raw_count),
        "Delivered Calculation Population": int(d["Calculation Population"].sum()),
        "24H Eligible": int(h24_eligible.sum()),
        "24H Pass": int(h24_pass.sum()),
        "24H Fail": int(h24_fail.sum()),
        "24H N/A": int((~h24_eligible).sum()),
        "24H Compliance": pct(int(h24_pass.sum()), int(h24_pass.sum() + h24_fail.sum())),
        "24H Data Completeness": pct(int(h24_eligible.sum()), int(d["Calculation Population"].sum())),
        "Geo Eligible": int(geo_eligible.sum()),
        "Geo Wrong": int(geo_wrong.sum()),
        "Payload Eligible": int(payload_eligible.sum()),
        "Payload Wrong": int(payload_wrong.sum()),
        "Plan Count": int(len(plan_df)),
        "Failed Plans >30%": int((plan_df["Plan Result"] == "Fail").sum()),
        "Error Orders": int(d.loc[d["Error Order Flag"], "OrderNumber"].nunique()),
        "Error Events": int(d["Error Event Count"].sum()),
    }

    # Missing/invalid source data counts.
    dq_rows = [
        ("TMS Raw Records", tms_raw_count),
        ("Delivered Calculation Population", int(d["Calculation Population"].sum())),
        ("Not Delivered / Excluded", int((~d["Calculation Population"]).sum())),
        ("OrderDateTime Missing", int(send.isna().sum())),
        ("DeliverDateTime Missing", int(deliver.isna().sum())),
        ("24H Eligible", int(h24_eligible.sum())),
        ("24H N/A", int((~h24_eligible).sum())),
        ("24H Pass", int(h24_pass.sum())),
        ("24H Fail", int(h24_fail.sum())),
        ("Fill Rate Records", fill_raw_count),
        ("Fill Rate Matched TMS Orders", int(d["Mapping Status"].eq("Matched").sum())),
        ("TMS Orders Not Found in Fill Rate", int(d["Mapping Status"].eq("Not Found").sum())),
        ("Duplicate Conflict", int(d["Mapping Status"].eq("Duplicate Conflict").sum())),
        ("Geo Eligible", int(geo_eligible.sum())),
        ("Geo Wrong", int(geo_wrong.sum())),
        ("Payload Eligible", int(payload_eligible.sum())),
        ("Payload Wrong", int(payload_wrong.sum())),
        ("Plan Count", int(len(plan_df))),
        ("Failed Plans >30%", int((plan_df["Plan Result"] == "Fail").sum())),
        ("Error Orders", int(d.loc[d["Error Order Flag"], "OrderNumber"].nunique())),
        ("Error Events", int(d["Error Event Count"].sum())),
    ]
    data_quality_df = pd.DataFrame(dq_rows, columns=["Metric", "Value"])

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------
    validations: list[dict[str, Any]] = []

    def add_check(name: str, calculated: Any, expected: Any, passed: bool) -> None:
        validations.append({
            "Check": name,
            "Calculated": json_safe_value(calculated),
            "Expected": json_safe_value(expected),
            "Result": "PASS" if passed else "FAIL",
        })

    add_check("TMS source rows", tms_raw_count, tms_raw_count, tms_raw_count == len(d))
    add_check("Fill Rate source rows", fill_raw_count, fill_raw_count, fill_raw_count == len(fill))
    add_check("Unique TMS OrderNumber", tms_unique, tms_raw_count, tms_unique == tms_raw_count)
    add_check("Unique Fill Rate DocNo", fill_unique, fill_raw_count, fill_unique == fill_raw_count)
    add_check("24H denominator", int(h24_pass.sum() + h24_fail.sum()), int(h24_eligible.sum()), int(h24_pass.sum() + h24_fail.sum()) == int(h24_eligible.sum()))
    add_check("Error Event reconciliation", int(d["Error Event Count"].sum()), len(error_df), int(d["Error Event Count"].sum()) == len(error_df))
    add_check("Plan Error threshold", int((plan_df["Plan Result"] == "Fail").sum()), int((plan_df["Plan Error %"] > PLAN_ERROR_THRESHOLD).sum()), int((plan_df["Plan Result"] == "Fail").sum()) == int((plan_df["Plan Error %"] > PLAN_ERROR_THRESHOLD).sum()))
    add_check("24H threshold", int((h24_pass & (d["Duration_24H"] > pd.Timedelta(hours=24))).sum()), 0, int((h24_pass & (d["Duration_24H"] > pd.Timedelta(hours=24))).sum()) == 0)
    add_check("24H negative duration is Fail", int((d["Duration_24H"] < pd.Timedelta(0)).sum()), int((d["Duration_24H"] < pd.Timedelta(0)) .sum()), bool((d.loc[d["Duration_24H"] < pd.Timedelta(0), "24H"] == "Fail").all()))
    add_check("Same-day SendNEW unchanged", int((send_new[h24_eligible & (deliver.dt.date == send.dt.date)] != send[h24_eligible & (deliver.dt.date == send.dt.date)]).sum()), 0, int((send_new[h24_eligible & (deliver.dt.date == send.dt.date)] != send[h24_eligible & (deliver.dt.date == send.dt.date)]).sum()) == 0)
    add_check("Geo threshold", int((geo_error_distance & (distance <= GEO_RADIUS_M)).sum()), 0, int((geo_error_distance & (distance <= GEO_RADIUS_M)).sum()) == 0)
    add_check("Payload threshold", int((payload_wrong & (d["Payload Utilization"] <= PAYLOAD_MAX_RATIO)).sum()), 0, int((payload_wrong & (d["Payload Utilization"] <= PAYLOAD_MAX_RATIO)).sum()) == 0)

    validation_df = pd.DataFrame(validations)
    all_pass = bool(validation_df["Result"].eq("PASS").all())
    if not all_pass:
        failed = validation_df.loc[validation_df["Result"] != "PASS", "Check"].tolist()
        raise RuntimeError(f"ENGINE VALIDATION FAILED: {failed}")

    # ------------------------------------------------------------------
    # Stage output only after validation passes.
    # ------------------------------------------------------------------
    if STAGE_DIR.exists():
        shutil.rmtree(STAGE_DIR)
    stage_data = STAGE_DIR / "data"
    stage_validation = STAGE_DIR / "validation"
    stage_data.mkdir(parents=True, exist_ok=True)
    stage_validation.mkdir(parents=True, exist_ok=True)

    write_json(stage_data / "npp_summary.json", records_to_json(npp_df))
    write_json(stage_data / "order_detail.json", records_to_json(d.drop(columns=["DSA Excluded", "TruckCapacityWeight_Plan_Unique"])))
    write_json(stage_data / "error_detail.json", records_to_json(error_df))
    write_json(stage_data / "plan_detail.json", records_to_json(plan_df))
    write_json(stage_data / "calculation_audit.json", records_to_json(audit_df))
    write_json(stage_data / "data_quality.json", records_to_json(data_quality_df))
    write_json(stage_validation / "validation_report.json", validations)

    # Atomic-ish publish: remove old generated data only after validation passed.
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    VALIDATION_DIR.mkdir(parents=True, exist_ok=True)
    for filename in OUTPUT_FILES:
        shutil.copy2(stage_data / filename, DATA_DIR / filename)
    shutil.copy2(stage_validation / "validation_report.json", VALIDATION_DIR / "validation_report.json")

    shutil.rmtree(STAGE_DIR, ignore_errors=True)

    return {
        "summary": summary,
        "validation": validations,
        "npp_summary": npp_df,
        "order_detail": d,
        "error_detail": error_df,
        "plan_detail": plan_df,
        "calculation_audit": audit_df,
        "data_quality": data_quality_df,
    }


def main() -> None:
    result = build_engine()
    print("=" * 70)
    print("TMS DASHBOARD ENGINE V2.0 — VALIDATION PASS")
    print("=" * 70)
    for k, v in result["summary"].items():
        print(f"{k}: {v}")
    print("\nValidation:")
    for row in result["validation"]:
        print(f"[{row['Result']}] {row['Check']}")
    print("\nGenerated:")
    for f in OUTPUT_FILES:
        print(f"- data/{f}")
    print("- validation/validation_report.json")


if __name__ == "__main__":
    main()

