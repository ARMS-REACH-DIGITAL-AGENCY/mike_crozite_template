#!/usr/bin/env python3
"""Read-only database health sample using PLAYERS_DATABASE_URL. No schema changes."""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

try:
    import psycopg
except ImportError:
    print("psycopg required", file=sys.stderr)
    raise

url = os.environ["PLAYERS_DATABASE_URL"]
with psycopg.connect(url, connect_timeout=10, options="-c statement_timeout=5000", autocommit=True) as conn:
    with conn.cursor() as cur:
        cur.execute("""
          SELECT current_setting('max_connections')::int,
            count(*)::int,
            count(*) FILTER (WHERE state='active')::int,
            count(*) FILTER (WHERE state='idle in transaction')::int,
            count(*) FILTER (WHERE wait_event_type='Lock')::int,
            COALESCE(max(extract(epoch from now()-query_start))
              FILTER (WHERE state='active'),0)::float
          FROM pg_stat_activity
        """)
        max_conn, total, active, idle_tx, locks, longest = cur.fetchone()
report = {"checked_at":datetime.now(timezone.utc).isoformat(),
          "max_connections":max_conn,"connections":total,
          "connection_utilization_pct":round(total/max_conn*100,1),
          "active_queries":active,"idle_in_transaction":idle_tx,
          "lock_waiters":locks,"longest_active_query_seconds":round(longest,1)}
warnings=[]
if total/max_conn >= .7: warnings.append("Connections >= 70% capacity")
if idle_tx > 2: warnings.append("Idle-in-transaction sessions > 2")
if locks > 5: warnings.append("Lock waiters > 5")
if longest > 30: warnings.append("Query running > 30 seconds")
report["warnings"]=warnings
print(json.dumps(report,indent=2))
with open("database-health-report.json","w") as f:json.dump(report,f,indent=2)
sys.exit(1 if warnings else 0)
