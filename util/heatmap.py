#!/usr/bin/env python3
"""Persistence heat cells from the harvested FixMyStreet reports -> util/heat_cells.csv.

Reports are snapped to ~55 m grid cells. A cell's score is how many separate days / weeks it had a report, not how
many reports it has, so one bad day (or one person reporting the same thing three times) counts once.
The map weights on active_weeks once there is months of history; active_days is the stand-in while there isn't.

python util/heatmap.py            # reads harvest/fixmystreet/data/fms.sqlite
python util/heatmap.py --selftest
"""
import argparse, csv, sqlite3
from collections import Counter, defaultdict
from datetime import datetime
from math import floor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAT_STEP, LON_STEP = 0.0005, 0.0008  # ~55 m x ~55 m at London's latitude
FIELDS = ["cell_id", "lat", "lon", "reports", "active_days", "active_weeks", "top_categories", "first_day", "last_day"]


def cells(reports):
    """reports: (lat, lon, category, 'YYYY-MM-DDTHH:MM:SS') tuples -> one dict per occupied cell."""
    acc = defaultdict(lambda: {"pts": [], "days": set(), "cats": Counter()})
    for lat, lon, cat, created in reports:
        c = acc[(floor(lat / LAT_STEP), floor(lon / LON_STEP))]
        c["pts"].append((lat, lon))
        c["days"].add(datetime.fromisoformat(created).date())
        c["cats"][cat or "unknown"] += 1
    out = []
    for (gy, gx), c in acc.items():
        n = len(c["pts"])
        out.append(dict(
            cell_id=f"{gy}_{gx}",
            lat=round(sum(p[0] for p in c["pts"]) / n, 6), lon=round(sum(p[1] for p in c["pts"]) / n, 6),
            reports=n, active_days=len(c["days"]), active_weeks=len({d.isocalendar()[:2] for d in c["days"]}),
            top_categories=";".join(k for k, _ in c["cats"].most_common(3)),
            first_day=min(c["days"]).isoformat(), last_day=max(c["days"]).isoformat()))
    return sorted(out, key=lambda r: (-r["active_days"], -r["reports"]))


def selftest():
    r = [(51.5400, -0.0700, "Litter", "2026-10-26T09:00:00"),
         (51.5401, -0.0701, "Litter", "2026-10-26T18:00:00"),  # same cell, same day: counts once
         (51.5401, -0.0700, "Fly Tipping", "2026-11-02T09:00:00"),  # same cell, next ISO week
         (51.5600, -0.0300, "Graffiti", "2026-10-27T09:00:00")]  # far away: own cell
    out = {c["cell_id"]: c for c in cells(r)}
    assert len(out) == 2
    c = max(out.values(), key=lambda c: c["reports"])
    assert (c["reports"], c["active_days"], c["active_weeks"]) == (3, 2, 2), c
    assert c["top_categories"] == "Litter;Fly Tipping", c
    print("selftest ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(ROOT / "harvest/fixmystreet/data/fms.sqlite"))
    ap.add_argument("--out", default=str(ROOT / "util/heat_cells.csv"))
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    rows = sqlite3.connect(a.db).execute(
        "SELECT json_extract(json, '$.latitude'), json_extract(json, '$.longitude'), category, created_iso "
        "FROM reports WHERE created_iso IS NOT NULL AND json_extract(json, '$.latitude') IS NOT NULL").fetchall()
    out = cells(rows)
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out)
    print(f"{len(rows)} reports -> {len(out)} cells; {sum(c['active_days'] >= 2 for c in out)} active on 2+ days -> {a.out}")


if __name__ == "__main__":
    main()
