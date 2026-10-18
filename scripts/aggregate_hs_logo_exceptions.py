#!/usr/bin/env python3
"""Combine per-batch results and output ONLY unresolved HS logo exceptions."""
import csv
from pathlib import Path

root=Path("batch-reports")
reports=sorted(root.glob("**/logo_batch_summary.csv"))
fields=["hsid","school","status","reason","source_page","published_key"]
all_rows=[]
for path in reports:
    with path.open(newline="",encoding="utf-8") as f:
        all_rows.extend(csv.DictReader(f))
exceptions=[r for r in all_rows if r.get("status")=="exception"]
published=sum(r.get("status")=="published" for r in all_rows)
existing=sum(r.get("status","").startswith("already_live") for r in all_rows)
with open("hs_logo_exceptions_only.csv","w",newline="",encoding="utf-8") as f:
    writer=csv.DictWriter(f,fieldnames=fields,extrasaction="ignore")
    writer.writeheader()
    writer.writerows(exceptions)
print(f"FINAL LOGO REPORT batches={len(reports)} checked={len(all_rows)} published={published} existing={existing} exceptions={len(exceptions)}")
if not reports:
    raise SystemExit("No per-batch reports found. Workflow not considered complete.")
