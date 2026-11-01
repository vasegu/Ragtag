#!/usr/bin/env python3
"""Script to push data/fms.sqlite + data/photos to Supabase (schema: supabase/migrations/*_fms_reports.sql).

Needs ../../.env with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (secret - never commit, never NEXT_PUBLIC_).
Safe to re-run: rows are upserted, photos overwritten.

python upload.py --out data
"""
import argparse, json, re, sqlite3, time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from main import BASE, grab, parse_fms_dt

ROOT = Path(__file__).resolve().parents[2]
BUCKET = "images"
CLOSED = {"closed", "fixed", "fixed - user", "fixed - council", "unable to fix", "not responsible",
          "duplicate", "no further action"}  # same guess as prune_closed_reports() in the migration


def env():
    e = dict(l.split("=", 1) for l in (ROOT / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
    e = {k.strip(): v.strip().strip("\"'") for k, v in e.items()}  # .env values may be quoted
    return e["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), e["SUPABASE_SERVICE_ROLE_KEY"]


def ts(x):  # harvester stores naive UK local time; Postgres would read it as UTC
    return datetime.fromisoformat(x).replace(tzinfo=ZoneInfo("Europe/London")).isoformat() if x else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data")
    out = Path(ap.parse_args().out)
    url, key = env()
    H = {"apikey": key, "Authorization": f"Bearer {key}"}
    db = sqlite3.connect(out / "fms.sqlite")
    db.row_factory = sqlite3.Row

    def upsert(table, rows, conflict=None):
        for i in range(0, len(rows), 200):
            r = requests.post(f"{url}/rest/v1/{table}" + (f"?on_conflict={conflict}" if conflict else ""),
                              headers={**H, "Prefer": "resolution=merge-duplicates"}, json=rows[i:i + 200], timeout=60)
            r.raise_for_status()

    month_ago = datetime.now(timezone.utc) - timedelta(days=30)
    reports, keep = [], set()
    for r in db.execute("SELECT r.id, r.json, r.header_text, r.created_iso, p.address, p.last_update, p.fetched_at "
                        "FROM reports r JOIN pins p ON p.id = r.id"):
        j, h = json.loads(r["json"]), r["header_text"] or ""
        last = ts(r["last_update"])
        state = (j.get("state") or "").lower()
        if (j.get("is_fixed") or state in CLOSED) and last and datetime.fromisoformat(last) < month_ago:
            continue  # closed > 1 month ago
        keep.add(r["id"])
        reports.append(dict(
            id=r["id"], title=j.get("title") or "", detail=j.get("detail"), category=j.get("category"),
            state=j.get("state"), is_fixed=bool(j.get("is_fixed")), postcode=j.get("postcode"), address=r["address"],
            reported_via=grab(r"Reported via (\w+)", h), via_app=grab(r" using (.+?) Sent to", h),
            anonymous="anonymously" in h,
            council=grab(r"Sent to (.+?) (?:less than a |about an? |\d+ |an? )?(?:second|minute|hour|day|week|month)s? later", h),
            lat=j["latitude"], lon=j["longitude"], created_at=ts(r["created_iso"]), last_update=last,
            confirmed_at=ts(parse_fms_dt(j.get("confirmed_pp"), date.fromisoformat(r["fetched_at"][:10]))),
            areas=[int(x) for x in (j.get("areas") or "").split(",") if x] or None))
    upsert("reports", reports)

    ups = [dict(update_id=u["update_id"], report_id=u["report_id"], body=u["text"], state_change=u["state_change"],
                posted_at=ts(u["posted_at"]), by_council=bool(u["author_is_council"]), anonymous=bool(u["anonymous"]))
           for u in db.execute("SELECT * FROM updates WHERE update_id IS NOT NULL") if u["report_id"] in keep]
    upsert("report_updates", ups)

    photos, n_files, failed = [], 0, []
    for p in db.execute("SELECT * FROM photos"):
        if p["report_id"] not in keep:
            continue
        path = None
        if p["local_path"] and Path(p["local_path"]).exists():
            path = Path(p["local_path"]).name
            for attempt in range(4):
                try:
                    r = requests.post(f"{url}/storage/v1/object/{BUCKET}/{path}", data=Path(p["local_path"]).read_bytes(),
                                      headers={**H, "Content-Type": "image/jpeg", "x-upsert": "true"}, timeout=120)
                    r.raise_for_status()
                    n_files += 1
                    break
                except requests.RequestException as e:
                    time.sleep(2 * (attempt + 1))
            else:
                print("photo upload failed, row kept without storage_path:", path, e)
                failed.append(path)
                path = None
        m = re.search(r"_u(\d+)_", path or "")
        photos.append(dict(report_id=p["report_id"], update_id=int(m.group(1)) if m else None,
                           source_url=BASE + p["url"] if p["url"].startswith("/") else p["url"], storage_path=path))
    upsert("report_photos", photos, conflict="report_id,source_url")
    print(f"uploaded {len(reports)} reports, {len(ups)} updates, {len(photos)} photo rows ({n_files} files)")


if __name__ == "__main__":
    main()
