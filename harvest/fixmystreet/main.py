#!/usr/bin/env python3
"""
FixMyStreet harvester (v2 - endpoints and selectors verified against the live site, 1 Nov 2026).

  GET /around?ajax=1&bbox=minLon,minLat,maxLon,maxLat&status=open|closed|fixed|all
            &sort=created-desc|updated-desc|...&p=<page>[&filter_category=...][&show_old_reports=1]
       -> {"pins": [[lat, lon, colour, id, title, "", false], ...],   (max 100 per page)
           "reports_list": "<ul>...<li data-report-id data-lastupdate>...",  (same 100, with address + thumbnail)
           "pagination": "1 to 100 of 462 Next"}
  GET /report/ajax/<id>   -> {"report": {...}, "updates": {}}        (updates always empty on fixmystreet.com)
  GET /report/<id>        -> HTML; updates parsed from li.item-list__item--updates
  GET /open311/v2/requests.json?jurisdiction_id=fixmystreet&start_date=..&end_date=..  (official bulk API)

robots.txt says: Crawl-delay: 3, Disallow: /photo/ and /report/new.
So: default delay is 3s, and photo BYTES are only downloaded with --photos (off by default).
Photo URLs are always stored. Read the README notes on this before turning --photos on.

pip install requests beautifulsoup4
python main.py --bbox -0.07,51.535,-0.04,51.555 --status open --pages 1 --limit 20 --out data   # -> data/reports.csv
"""
import argparse, csv, json, re, sqlite3, time
from datetime import date, datetime
from pathlib import Path
import requests
from bs4 import BeautifulSoup

BASE = "https://www.fixmystreet.com"
UA = "harvest-research/0.2 (contact: CHANGE-ME@example.com)"  # put a real contact
s = requests.Session()
s.headers["User-Agent"] = UA
DELAY = 3.0  # robots.txt Crawl-delay


def get(url, **kw):
    time.sleep(DELAY)
    r = s.get(url, timeout=30, **kw)
    r.raise_for_status()
    return r


def absurl(u):
    return u if u.startswith("http") else BASE + u


# ---- date parsing: the site only gives human strings ("09:22 today", "14:08, Saturday 31 October 2026")
def _dmy(s):  # the site mixes "28 October 2026" and "28 Oct 2026"
    for f in ("%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(s, f).date()
        except ValueError:
            pass
    raise ValueError(s)


def parse_fms_dt(txt, today=None):
    today = today or date.today()
    m = re.search(r"(\d{1,2}):(\d{2})(?:,\s*\w+day)?\s*(?:(today)|(?:,?\s*(?:\w+day\s+)?(\d{1,2}\s+\w+\s+\d{4})))?", txt or "")
    if not m:
        return None
    hh, mm, is_today, dpart = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
    try:
        if is_today:
            d = today
        elif dpart:
            d = _dmy(dpart)
        else:
            m2 = re.search(r"(\d{1,2}\s+\w+\s+\d{4})", txt)
            d = _dmy(m2.group(1)) if m2 else None
        return datetime(d.year, d.month, d.day, hh, mm).isoformat() if d else None
    except Exception:
        return None  # keep the raw string alongside, never lose it


# ---- pins + list
def fetch_page(bbox, status, sort, p, category=None, old=False):
    params = {"ajax": 1, "bbox": bbox, "status": status, "sort": sort, "p": p}
    if category:
        params["filter_category"] = category
    if old:
        params["show_old_reports"] = 1
    j = get(f"{BASE}/around", params=params).json()
    lst = BeautifulSoup(j.get("reports_list", ""), "html.parser")
    extra = {}
    for li in lst.select("li[data-report-id]"):
        addr = li.select_one(".visuallyhidden")
        img = li.select_one("img")
        extra[int(li["data-report-id"])] = {
            "last_update": li.get("data-lastupdate"),  # ISO, machine-readable
            "address": addr.get_text(" ", strip=True) if addr else None,
            "thumb": img["src"].split("?")[0] if img else None,
            "list_text": li.get_text(" ", strip=True),
        }
    pins = [{"id": p_[3], "lat": p_[0], "lon": p_[1], "colour": p_[2], "title": p_[4],
             **extra.get(p_[3], {})} for p_ in j.get("pins", [])]
    total = re.search(r"of (\d+)", BeautifulSoup(j.get("pagination", ""), "html.parser").get_text(" "))
    return pins, int(total.group(1)) if total else len(pins)


# ---- report + updates
def fetch_report(rid):
    return get(f"{BASE}/report/ajax/{rid}").json()["report"]


def fetch_page_html(rid):
    soup = BeautifulSoup(get(f"{BASE}/report/{rid}").text, "html.parser")
    updates = []
    for li in soup.select("li.item-list__item--updates"):
        a = li.find("a", attrs={"name": re.compile(r"^update_\d+")})
        body = li.select_one(".item-list__update-text .moderate-display")
        metas = [m.get_text(" ", strip=True) for m in li.select(".item-list__update-text .meta-2")]
        imgs = []
        for im in li.select(".update-img a[href]"):
            imgs.append(im["href"].split("?")[0])  # .full.jpeg
        text = body.get_text(" ", strip=True) if body else ""
        state = next((m.split(":", 1)[1].strip() for m in metas if m.startswith("State changed to")), None)
        byline = next((m for m in metas if re.search(r"(Posted|Updated)", m)), "")
        updates.append({
            "update_id": int(a["name"].split("_")[1]) if a else None,
            "text": text, "state_change": state, "byline": byline,
            "author_is_council": bool(li.select_one("strong")),
            "anonymous": "anonymously" in byline,
            "posted_at": parse_fms_dt(byline),
            "photos": imgs,
        })
    # report-level meta: "Reported via mobile in the X category anonymously at ..., Sent to Hackney Council ..."
    head = soup.select_one(".problem-header")
    return updates, head.get_text(" ", strip=True) if head else None


def download(url, dest):
    if dest.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(get(absurl(url)).content)


def db_init(path):
    db = sqlite3.connect(path)
    db.executescript("""
    CREATE TABLE IF NOT EXISTS pins(id INTEGER PRIMARY KEY, lat REAL, lon REAL, colour TEXT, title TEXT,
        address TEXT, last_update TEXT, thumb TEXT, fetched_at TEXT);
    CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY, json TEXT, header_text TEXT,
        created_iso TEXT, category TEXT, state TEXT, state_t TEXT);
    CREATE TABLE IF NOT EXISTS updates(report_id INTEGER, update_id INTEGER, text TEXT, state_change TEXT,
        byline TEXT, posted_at TEXT, author_is_council INTEGER, anonymous INTEGER, photos TEXT,
        PRIMARY KEY(report_id, update_id));
    CREATE TABLE IF NOT EXISTS photos(report_id INTEGER, url TEXT, local_path TEXT, PRIMARY KEY(report_id, url));
    """)
    return db


RESOLVED = re.compile(r"fixed|closed|unable|not responsible|duplicate|no further", re.I)


def grab(pat, txt):
    m = re.search(pat, txt)
    return m.group(1).strip() if m else None


def hours(a, b):
    return round((datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() / 3600, 2) if a and b else None


def export_csv(db, out):
    """One row per pin; report/update columns are blank for pins that never got the full fetch."""
    # public Supabase Storage URL for the files upload.py pushes (the project URL is not a secret)
    env = Path(__file__).resolve().parents[2] / ".env"
    url = next((l.split("=", 1)[1].strip().strip("\"'").rstrip("/") for l in env.read_text().splitlines()
                if l.startswith("NEXT_PUBLIC_SUPABASE_URL=")), "") if env.exists() else ""
    base = f"{url}/storage/v1/object/public/images"
    ups = {}
    for rid, text, sc, at, council in db.execute(
            "SELECT report_id, text, state_change, posted_at, author_is_council FROM updates ORDER BY posted_at"):
        ups.setdefault(rid, []).append((text, sc, at, council))
    db.row_factory = sqlite3.Row
    rows = []
    for r in db.execute("""SELECT p.id, p.lat, p.lon, p.title, p.address, p.colour, p.last_update, p.thumb, p.fetched_at,
            r.category, r.state, r.created_iso, r.header_text, r.json AS report_json,
            (SELECT group_concat(local_path, ';') FROM photos h WHERE h.report_id = p.id AND h.local_path IS NOT NULL) AS photo_urls
            FROM pins p LEFT JOIN reports r ON r.id = p.id ORDER BY p.id DESC"""):
        r = dict(r)
        u = ups.get(r["id"], [])
        h = r.pop("header_text") or ""
        j = json.loads(r.pop("report_json") or "{}")  # exploded below; keys already covered elsewhere are dropped
        harvested = date.fromisoformat(r.pop("fetched_at")[:10])  # "today" in the site's text means this day
        r["photo_urls"] = ";".join(f"{base}/{Path(p).name}" for p in (r["photo_urls"] or "").split(";") if p) or None
        first = lambda ok: min((x[2] for x in u if x[2] and ok(x)), default=None)
        resp, act, done = first(lambda x: x[3]), first(lambda x: x[1]), first(lambda x: x[1] and RESOLVED.search(x[1]))
        r.update(
            detail=j.get("detail"), postcode=j.get("postcode"), is_fixed=j.get("is_fixed"),
            confirmed_at=parse_fms_dt(j.get("confirmed_pp"), harvested),
            areas=";".join(x for x in (j.get("areas") or "").split(",") if x) or None,
            url=f"{BASE}/report/{r['id']}",
            reported_via=grab(r"Reported via (\w+)", h),
            via_app=grab(r" using (.+?) Sent to", h),
            anonymous=int("anonymously" in h) if h else None,
            council=grab(r"Sent to (.+?) (?:less than a |about an? |\d+ |an? )?(?:second|minute|hour|day|week|month)s? later", h),
            n_updates=len(u), n_council_updates=sum(1 for x in u if x[3]),
            first_response_at=resp, hours_to_response=hours(r["created_iso"], resp),
            first_action_at=act, hours_to_action=hours(r["created_iso"], act),
            resolved_at=done, hours_to_resolved=hours(r["created_iso"], done),
            updates_text=" | ".join(f"{'COUNCIL' if x[3] else 'USER'}: {x[0]}" for x in u),
        )
        rows.append(r)
    with open(out / "reports.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else [])
        w.writeheader()
        w.writerows(rows)
    print("wrote", out / "reports.csv", f"({len(rows)} rows)")


def main():
    global DELAY
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", required=True, help="minLon,minLat,maxLon,maxLat")
    ap.add_argument("--status", default="open", choices=["open", "closed", "fixed", "all"])
    ap.add_argument("--sort", default="created-desc")
    ap.add_argument("--category")
    ap.add_argument("--pages", type=int, default=1, help="list pages (100 reports each)")
    ap.add_argument("--limit", type=int, default=20, help="max reports to fetch in full")
    ap.add_argument("--photos", action="store_true", help="download photo bytes (robots.txt disallows /photo/)")
    ap.add_argument("--delay", type=float, default=3.0)
    ap.add_argument("--out", default="data")
    ap.add_argument("--match", default="", help='only fully fetch pins whose address contains this, e.g. ", Hackney, London"')
    ap.add_argument("--old", action="store_true", help="include old reports (show_old_reports=1)")
    ap.add_argument("--light", action="store_true", help="history mode: /report/ajax only, no HTML page, updates or photos")
    ap.add_argument("--csv-only", action="store_true", help="rebuild reports.csv from fms.sqlite, no requests")
    a = ap.parse_args()
    DELAY = max(a.delay, 3.0)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    db = db_init(out / "fms.sqlite")
    if a.csv_only:
        return export_csv(db, out)
    now = datetime.utcnow().isoformat()

    all_pins = []
    for p in range(1, a.pages + 1):
        pins, total = fetch_page(a.bbox, a.status, a.sort, p, a.category, a.old)
        print(f"page {p}: {len(pins)} pins (total in bbox: {total})")
        all_pins += pins
        if len(all_pins) >= total:
            break
    for p in all_pins:
        db.execute("INSERT OR REPLACE INTO pins VALUES(?,?,?,?,?,?,?,?,?)",
                   (p["id"], p["lat"], p["lon"], p["colour"], p["title"], p.get("address"),
                    p.get("last_update"), p.get("thumb"), now))
    db.commit()

    # already fetched, don't repeat; light rows (no header_text) still get a full fetch later
    have = {x[0] for x in db.execute("SELECT id FROM reports" + ("" if a.light else " WHERE header_text IS NOT NULL"))}
    todo = [p for p in all_pins if p["id"] not in have and a.match in (p.get("address") or "")]
    print(f"{len(todo)} to fetch in full ({len(all_pins)} pins, filter {a.match!r})")
    for p in todo[:a.limit]:
        rid = p["id"]
        try:
            rep = fetch_report(rid)
            updates, header = ([], None) if a.light else fetch_page_html(rid)
            db.execute("INSERT OR REPLACE INTO reports VALUES(?,?,?,?,?,?,?)",
                       (rid, json.dumps(rep), header, parse_fms_dt(rep.get("created_pp")),
                        rep.get("category"), rep.get("state"), rep.get("state_t")))
            for url in rep.get("photos", []):
                url = url.split("?")[0]
                lp = None
                if a.photos:
                    lp = str(out / "photos" / f"{rid}_{url.rsplit('/',1)[-1]}")
                    download(url.replace(".jpeg", ".full.jpeg") if ".full." not in url else url, Path(lp))
                db.execute("INSERT OR REPLACE INTO photos VALUES(?,?,?)", (rid, url, lp))
            for u in updates:
                db.execute("INSERT OR REPLACE INTO updates VALUES(?,?,?,?,?,?,?,?,?)",
                           (rid, u["update_id"], u["text"], u["state_change"], u["byline"], u["posted_at"],
                            int(u["author_is_council"]), int(u["anonymous"]), json.dumps(u["photos"])))
                for url in u["photos"]:
                    lp = None
                    if a.photos:
                        lp = str(out / "photos" / f"{rid}_u{u['update_id']}_{url.rsplit('/',1)[-1]}")
                        download(url, Path(lp))
                    db.execute("INSERT OR REPLACE INTO photos VALUES(?,?,?)", (rid, url, lp))
            db.commit()
            print("ok", rid, p["title"][:60], f"({len(updates)} updates)")
        except Exception as e:
            print("fail", rid, e)

    export_csv(db, out)


if __name__ == "__main__":
    main()