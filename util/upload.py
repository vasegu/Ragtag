#!/usr/bin/env python3
"""Push util/heat_cells.csv (from heatmap.py) to the Supabase `heat_cells` table.

Needs ../.env with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (secret - never commit, never NEXT_PUBLIC_).
Safe to re-run: rows are upserted by cell_id.
# ponytail: cells that stop existing are not deleted; heatmap.py only ever adds history, so none do.

python util/upload.py
"""
import argparse, csv
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
INTS = ("reports", "active_days", "active_weeks")
FLOATS = ("lat", "lon")


def env():
    e = dict(l.split("=", 1) for l in (ROOT / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
    e = {k.strip(): v.strip().strip("\"'") for k, v in e.items()}  # .env values may be quoted
    return e["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), e["SUPABASE_SERVICE_ROLE_KEY"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(ROOT / "util/heat_cells.csv"))
    a = ap.parse_args()
    url, key = env()
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for r in csv.DictReader(open(a.csv, encoding="utf-8")):
        rows.append({**r, **{k: int(r[k]) for k in INTS}, **{k: float(r[k]) for k in FLOATS}, "updated_at": now})
    for i in range(0, len(rows), 500):
        requests.post(f"{url}/rest/v1/heat_cells", json=rows[i:i + 500], timeout=60,
                      headers={"apikey": key, "Authorization": f"Bearer {key}",
                               "Prefer": "resolution=merge-duplicates"}).raise_for_status()
    print(f"uploaded {len(rows)} heat cells")


if __name__ == "__main__":
    main()
