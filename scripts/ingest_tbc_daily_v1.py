import os
import io
import logging
from datetime import date
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
import requests
try:
    import cloudscraper
    HAS_CLOUDSCRAPER = True
except ImportError:
    HAS_CLOUDSCRAPER = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")
PW = "yattbc"
BASE = "https://thebaseballcube.com/data/feed/yatstats"
FEEDS = {
    "players": f"{BASE}/players/?pw={PW}",
    "batting": f"{BASE}/batting/?pw={PW}",
    "pitching": f"{BASE}/pitching/?pw={PW}",
}

def get_feed(url):
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        r = requests.get(url, headers=headers, timeout=30)
        r.raise_for_status()
        return r.content
    except:
        if HAS_CLOUDSCRAPER:
            logger.info("Cloudflare hit → cloudscraper fallback")
            scraper = cloudscraper.create_scraper()
            r = scraper.get(url, timeout=30)
            r.raise_for_status()
            return r.content
        raise

def refresh_table(feed_type):
    logger.info(f"→ Fetching fresh {feed_type} data")
    content = get_feed(FEEDS[feed_type])
    df = pd.read_csv(io.BytesIO(content))

    # Known safe renames from our earlier work (2B/3B → dbl/tpl if present)
    df = df.rename(columns={"2B": "dbl", "3B": "tpl", "2b": "dbl", "3b": "tpl"})

    table = f"tbc_{feed_type}_raw"
    cols = [c.lower() for c in df.columns]
    df.columns = cols

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # TRUNCATE + full reload — keeps app queries 100% happy
    cur.execute(f"TRUNCATE TABLE {table} RESTART IDENTITY;")
    logger.info(f"Truncated {table} — reloading fresh data")

    values = [tuple(row) for row in df.itertuples(index=False)]
    query = f"""
        INSERT INTO {table} ({', '.join(cols)})
        VALUES %s
    """
    execute_values(cur, query, values)
    conn.commit()
    cur.close()
    conn.close()
    logger.info(f"✅ {len(df):,} rows loaded into {table}")

if __name__ == "__main__":
    for t in ["players", "batting", "pitching"]:
        refresh_table(t)
    logger.info("🎉 v1 TBC ingest complete — app sees fresh data, history preserved for v1.5")
