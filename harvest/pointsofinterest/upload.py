#!/usr/bin/env python3
"""Script to push data/pois.csv + each place's image to Supabase (schema: supabase/migrations/*_pois.sql).

Needs ../../.env with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (secret - never commit, never NEXT_PUBLIC_).
Images are fetched from image_url (Wikimedia Commons) and stored at images/pois/<osm_type>_<osm_id>.<ext>.
Safe to re-run: rows are upserted, images overwritten.

python upload.py --out data
python upload.py --no-images     # rows only
"""
import argparse, csv, json, time
from pathlib import Path

import requests

from main import UA

ROOT = Path(__file__).resolve().parents[2]
BUCKET = "images"
NUM = {"severity": int, "osm_id": int, "lat": float, "lon": float,
       "bbox_min_lon": float, "bbox_min_lat": float, "bbox_max_lon": float, "bbox_max_lat": float}
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


def env():
    e = dict(l.split("=", 1) for l in (ROOT / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
    e = {k.strip(): v.strip().strip("\"'") for k, v in e.items()}  # .env values may be quoted
    return e["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), e["SUPABASE_SERVICE_ROLE_KEY"]


def to_row(r):
    """CSV strings -> table types; blank -> null."""
    r = {k: (v if v != "" else None) for k, v in r.items()}
    for k, f in NUM.items():
        r[k] = f(r[k]) if r[k] is not None else None
    r["tags"] = json.loads(r.pop("tags_json") or "{}")
    r["storage_path"] = None
    return r


def retry(fn, tries=4):
    for attempt in range(tries):
        try:
            r = fn()
            r.raise_for_status()
            return r
        except requests.RequestException:
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data")
    ap.add_argument("--no-images", action="store_true")
    a = ap.parse_args()
    url, key = env()
    H = {"apikey": key, "Authorization": f"Bearer {key}"}
    rows = [to_row(r) for r in csv.DictReader(open(Path(a.out) / "pois.csv", encoding="utf-8"))]

    n_files, failed = 0, []
    for r in rows if not a.no_images else []:
        if not r["image_url"]:
            continue
        try:
            img = retry(lambda: requests.get(r["image_url"], headers={"User-Agent": UA}, timeout=60))
            ctype = img.headers.get("Content-Type", "").split(";")[0]
            path = f"pois/{r['osm_type']}_{r['osm_id']}.{EXT.get(ctype, 'jpg')}"
            retry(lambda: requests.post(f"{url}/storage/v1/object/{BUCKET}/{path}", data=img.content,
                                        headers={**H, "Content-Type": ctype or "image/jpeg", "x-upsert": "true"}, timeout=120))
            r["storage_path"] = path
            n_files += 1
        except requests.RequestException as e:
            print("image failed, row kept without storage_path:", r["name"], e)
            failed.append(r["name"])
        time.sleep(1)  # be polite to Wikimedia

    for i in range(0, len(rows), 200):
        retry(lambda: requests.post(f"{url}/rest/v1/pois?on_conflict=osm_type,osm_id",
                                    headers={**H, "Prefer": "resolution=merge-duplicates"}, json=rows[i:i + 200], timeout=60))
    print(f"uploaded {len(rows)} pois ({n_files} images, {len(failed)} image failures)")


if __name__ == "__main__":
    main()
