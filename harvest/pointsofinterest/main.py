#!/usr/bin/env python3
"""
Points-of-interest harvester: OpenStreetMap via the public Overpass API (no key).

  POST https://overpass-api.de/api/interpreter  data=[out:json];(nwr[tags](s,w,n,e);...);out tags center bb;
       -> {"elements": [{"type": "node|way|relation", "id", "lat"/"lon" | "center", "bounds", "tags"}]}
  GET  https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q1|Q2&props=claims   (P18 = image, max 50 ids)

Severity: 1 = most sensitive (children), 3 = least. Edit CATEGORIES to add/change types or numbers.
An element matching several categories (a church school) gets one row, with the most severe category.

pip install -r ../requirements.txt   (shared venv: harvest/.venv)
python main.py                                   # Hackney, 10 well-spread per category -> data/pois.csv
python main.py --per-category 0                  # everything
python main.py --bbox -0.08,51.53,-0.04,51.56    # minLon,minLat,maxLon,maxLat (same order as fixmystreet)
python main.py --test                            # offline self-check
"""
import argparse, csv, json, math, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
import requests

OVERPASS = ["https://overpass-api.de/api/interpreter",  # main instance; mirrors tried in turn on retry
            "https://overpass.private.coffee/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
WIKIDATA = "https://www.wikidata.org/w/api.php"
UA = "harvest-research/0.2"  # Overpass 406s example.com contacts; append " (contact: you@realdomain)" if you like
s = requests.Session()
s.headers["User-Agent"] = UA

HACKNEY = "-0.1067,51.5193,-0.0166,51.5787"  # approx London Borough of Hackney

# name: (severity, OSM tags that must all match; True = tag present with any value)
CATEGORIES = {
    "school":           (1, {"amenity": "school"}),
    "kindergarten":     (1, {"amenity": "kindergarten"}),
    "playground":       (1, {"leisure": "playground"}),
    "hospital":         (2, {"amenity": "hospital"}),
    "place_of_worship": (2, {"amenity": "place_of_worship"}),  # mosques, churches, synagogues...; see `religion`
    "park":             (3, {"leisure": "park"}),
    "supermarket":      (3, {"shop": "supermarket"}),
}


def bbox_to_overpass(bbox):
    """minLon,minLat,maxLon,maxLat -> (s, w, n, e), validated."""
    w, s_, e, n = map(float, bbox.split(","))
    if not (-180 <= w < e <= 180 and -90 <= s_ < n <= 90):
        raise ValueError(f"bad bbox {bbox!r}: need minLon,minLat,maxLon,maxLat with min < max")
    return s_, w, n, e


def tag_filter(tags):
    esc = lambda x: str(x).replace("\\", "\\\\").replace('"', '\\"')
    return "".join(f'["{esc(k)}"]' if v is True else f'["{esc(k)}"="{esc(v)}"]' for k, v in tags.items())


def matches(tags, want):
    return all(k in tags if v is True else tags.get(k) == v for k, v in want.items())


def build_query(bbox, categories=CATEGORIES):
    b = ",".join(map(str, bbox_to_overpass(bbox)))
    body = "".join(f"nwr{tag_filter(t)}({b});" for _, t in categories.values())
    return f"[out:json][timeout:90];({body});out tags center bb;"


def overpass(query, retries=3):
    for attempt in range(retries + 1):
        try:
            url = OVERPASS[attempt % len(OVERPASS)]
            r = s.post(url, data={"data": query}, timeout=120)
            if r.status_code not in (429, 502, 503, 504):
                r.raise_for_status()
                return r.json()
            err = f"HTTP {r.status_code} from {url}"
        except (requests.ConnectionError, requests.Timeout) as e:
            err = str(e)
        if attempt == retries:
            raise RuntimeError(f"Overpass failed after {retries + 1} tries: {err}")
        wait = 10 * 2 ** attempt  # public instances rate-limit: 10s, 20s, 40s
        print(f"Overpass busy ({err}), retrying in {wait}s")
        time.sleep(wait)


def commons_url(filename):
    f = filename.split(":", 1)[-1] if filename.lower().startswith(("file:", "image:")) else filename
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{quote(f.replace(' ', '_'))}?width=800"


def wikidata_images(qids):
    """{Q123: commons url} from Wikidata P18, batched 50 per request."""
    out, qids = {}, sorted(set(qids))
    for i in range(0, len(qids), 50):
        try:
            r = s.get(WIKIDATA, params={"action": "wbgetentities", "ids": "|".join(qids[i:i + 50]),
                                        "props": "claims", "format": "json"}, timeout=30)
            r.raise_for_status()
            for q, ent in r.json().get("entities", {}).items():
                p18 = ent.get("claims", {}).get("P18")
                if p18:
                    out[q] = commons_url(p18[0]["mainsnak"]["datavalue"]["value"])
        except Exception as e:  # images are a nice-to-have; never lose the rows over them
            print("wikidata images failed:", e)
        time.sleep(1)
    return out


def to_rows(data, categories=CATEGORIES, images=None):
    """One row per (type, id). Unnamed places are kept (name blank)."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = {}
    for el in data.get("elements", []):
        key = (el["type"], el["id"])
        t = el.get("tags", {})
        bb = el.get("bounds")  # with `bb`, Overpass returns bounds and omits center for ways/relations
        c = el.get("center") or (bb and {"lat": (bb["minlat"] + bb["maxlat"]) / 2, "lon": (bb["minlon"] + bb["maxlon"]) / 2}) or {}
        lat, lon = el.get("lat", c.get("lat")), el.get("lon", c.get("lon"))
        hits = sorted((sev, name) for name, (sev, want) in categories.items() if matches(t, want))
        if key in rows or lat is None or not hits:
            continue
        b = bb or {"minlat": lat, "minlon": lon, "maxlat": lat, "maxlon": lon}  # nodes: a point
        img = t.get("image") if str(t.get("image", "")).startswith("http") else None
        if not img and t.get("wikimedia_commons", "").lower().startswith("file:"):
            img = commons_url(t["wikimedia_commons"])
        if not img and t.get("wikidata"):
            img = (images or {}).get(t["wikidata"])
        addr = ", ".join(x for x in (" ".join(filter(None, (t.get("addr:housenumber"), t.get("addr:street")))),
                                     t.get("addr:city"), t.get("addr:postcode")) if x)
        rows[key] = dict(
            category=hits[0][1], severity=hits[0][0],
            osm_type=el["type"], osm_id=el["id"], name=t.get("name") or t.get("official_name"),
            lat=lat, lon=lon,
            bbox_min_lon=b["minlon"], bbox_min_lat=b["minlat"], bbox_max_lon=b["maxlon"], bbox_max_lat=b["maxlat"],
            religion=t.get("religion"), operator=t.get("operator"),
            address=addr or None, postcode=t.get("addr:postcode"),
            website=t.get("website") or t.get("contact:website"),
            image_url=img, wikidata=t.get("wikidata"),
            osm_url=f"https://www.openstreetmap.org/{el['type']}/{el['id']}",
            tags_json=json.dumps(t, ensure_ascii=False),  # everything else OSM has, so nothing is lost
            harvested_at=now,
        )
    return sorted(rows.values(), key=lambda r: (r["severity"], r["category"], r["name"] or ""))


def spread(rows, n):
    """Up to n rows per category, geographically spread (greedy farthest-point).
    Prefers named places, and starts from the most complete row (most filled-in columns)."""
    score = lambda r: sum(v not in (None, "") for v in r.values())
    out = []
    for cat in dict.fromkeys(r["category"] for r in rows):
        group = [r for r in rows if r["category"] == cat]
        named = [r for r in group if r["name"]]
        pool = sorted(named if len(named) >= n else group, key=score, reverse=True)
        kx = math.cos(math.radians(float(pool[0]["lat"])))  # degrees of lon are shorter than lat
        d2 = lambda a, b: ((float(a["lon"]) - float(b["lon"])) * kx) ** 2 + (float(a["lat"]) - float(b["lat"])) ** 2
        pick = pool[:1]
        while len(pick) < min(n, len(pool)):
            # ponytail: O(n^2 * pool) per category, fine for thousands of rows
            pick.append(max((r for r in pool if r not in pick), key=lambda r: (min(d2(r, p) for p in pick), score(r))))
        out += pick
    return out


def write_csv(rows, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else [])
        w.writeheader()
        w.writerows(rows)
    print("wrote", path, f"({len(rows)} rows)")


def selftest():
    assert bbox_to_overpass("-0.08,51.53,-0.04,51.56") == (51.53, -0.08, 51.56, -0.04)
    for bad in ("0,0,0,1", "-0.04,51.53,-0.08,51.56", "0,91,1,92"):
        try:
            bbox_to_overpass(bad); raise AssertionError(bad)
        except ValueError:
            pass
    q = build_query("-0.08,51.53,-0.04,51.56", {"a": (1, {"amenity": "school"}), "b": (2, {"name": True})})
    assert 'nwr["amenity"="school"](51.53,-0.08,51.56,-0.04);nwr["name"](' in q and q.endswith("out tags center bb;")
    fake = {"elements": [
        {"type": "way", "id": 7, "center": {"lat": 51.6, "lon": -0.06},
         "bounds": {"minlat": 51.59, "minlon": -0.07, "maxlat": 51.61, "maxlon": -0.05},
         "tags": {"amenity": "school", "religion": "christian", "name": "St X", "wikidata": "Q1"}},
        {"type": "way", "id": 7, "center": {"lat": 51.6, "lon": -0.06}, "tags": {"amenity": "school"}},
        {"type": "node", "id": 1, "lat": 51.5, "lon": -0.05, "tags": {"shop": "supermarket"}},
        {"type": "relation", "id": 9, "tags": {"amenity": "school"}},  # no centre -> skipped
        {"type": "way", "id": 8, "bounds": {"minlat": 51.0, "minlon": -1.0, "maxlat": 52.0, "maxlon": 0.0},
         "tags": {"leisure": "park"}},  # real `bb` output: bounds only -> centre is the bbox middle
    ]}
    rows = to_rows(fake, images={"Q1": "http://img"})
    assert [(r["osm_type"], r["category"], r["severity"], r["name"]) for r in rows] == \
           [("way", "school", 1, "St X"), ("way", "park", 3, None), ("node", "supermarket", 3, None)]
    assert (rows[1]["lat"], rows[1]["lon"]) == (51.5, -0.5)
    rows = [rows[0], rows[2]]
    assert rows[0]["image_url"] == "http://img" and rows[0]["bbox_max_lat"] == 51.61
    assert rows[1]["bbox_min_lat"] == rows[1]["bbox_max_lat"] == 51.5
    assert to_rows({}) == []
    grid = [dict(category="c", name=f"p{i}", lat=51 + i / 100, lon=0) for i in range(11)] + \
           [dict(category="d", name="", lat=51, lon=0)]
    got = spread(grid, 2)
    assert {r["name"] for r in got if r["category"] == "c"} == {"p0", "p10"} and len(got) == 3  # the two ends
    assert spread(grid, 10)[-1]["category"] == "d"  # unnamed kept when that's all there is
    assert commons_url("File:A b.jpg").endswith("FilePath/A_b.jpg?width=800")
    print("ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", default=HACKNEY, help="minLon,minLat,maxLon,maxLat (default: Hackney)")
    ap.add_argument("--out", default=str(Path(__file__).with_name("data")))
    ap.add_argument("--no-images", action="store_true", help="skip the Wikidata image lookup")
    ap.add_argument("--per-category", type=int, default=10, help="keep N well-spread places per category (0 = all)")
    ap.add_argument("--test", action="store_true")
    a = ap.parse_args()
    if a.test:
        return selftest()
    data = overpass(build_query(a.bbox))
    print(f"{len(data.get('elements', []))} OSM elements")
    qids = [e["tags"]["wikidata"] for e in data.get("elements", []) if e.get("tags", {}).get("wikidata")]
    rows = to_rows(data, images={} if a.no_images else wikidata_images(qids))
    if a.per_category:
        rows = spread(rows, a.per_category)
    for name in CATEGORIES:
        print(f"  {name:17} {sum(r['category'] == name for r in rows)}")
    write_csv(rows, Path(a.out) / "pois.csv")


if __name__ == "__main__":
    main()
