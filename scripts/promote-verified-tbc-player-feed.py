#!/usr/bin/env python3
"""Publish each validated TBC Players snapshot all the way to flip_card_front_stage.

Run from GitHub Actions after the immutable source capture. Every write is a
bounded, retry-safe PostgreSQL transaction. Never guess missing school identity
or overwrite independently verified player status, current team, or fan edits.
"""
import json
import os
import sys
import subprocess
from datetime import datetime, timezone
from uuid import UUID

import psycopg

RUN_ID = str(UUID(os.environ["TBC_SOURCE_RUN_ID"]))
RAW_BATCH = 5000
CARD_BATCH = 2000
MAX_BATCHES = 120
PG_TIMEOUT = 90_000


def execute(sql, params=()):
    with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=30) as conn:
        with conn.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '5s'")
            cursor.execute("SET LOCAL statement_timeout = '90000ms'")
            cursor.execute(sql, params)
            result = cursor.fetchone()
            conn.commit()
            return result


def pulse(step, data):
    print(json.dumps({"step": step, "run_id": RUN_ID, "result": data},
                     default=str, sort_keys=True), flush=True)


def job_health(ok, outcome):
    # An incomplete publication is a failure, never a healthy source download.
    execute("""
        INSERT INTO public.ingest_job_health(
            job_name,last_success_at,last_failure_at,consecutive_failures,
            last_error,last_result,updated_at
        ) VALUES (
            'tbc_players_canonical_publication',
            CASE WHEN %s THEN now() ELSE NULL END,
            CASE WHEN %s THEN NULL ELSE now() END,
            CASE WHEN %s THEN 0 ELSE 1 END,
            CASE WHEN %s THEN NULL ELSE %s END,
            %s::jsonb,now()
        )
        ON CONFLICT(job_name) DO UPDATE SET
            last_success_at=CASE WHEN %s THEN now() ELSE ingest_job_health.last_success_at END,
            last_failure_at=CASE WHEN %s THEN ingest_job_health.last_failure_at ELSE now() END,
            consecutive_failures=CASE WHEN %s THEN 0 ELSE ingest_job_health.consecutive_failures+1 END,
            last_error=CASE WHEN %s THEN NULL ELSE %s END,
            last_result=%s::jsonb,updated_at=now()
        RETURNING job_name
    """, (ok,ok,ok,ok,None if ok else "Incomplete TBC publication",
          json.dumps(outcome),ok,ok,ok,ok,
          None if ok else "Incomplete TBC publication",json.dumps(outcome)))


def main():
    now = datetime.now(timezone.utc)
    if now.year != 2026:
        raise RuntimeError(
            "STOP: 2026-only status materializer cannot publish a new season; "
            "configure and validate the 2027 season-source authority first"
        )

    source = execute("""
        SELECT source_rows,unique_ids,quarantined_rows,status,source_sha256
        FROM public.tbc_players_full_feed_audit_runs WHERE run_id=%s
    """, (RUN_ID,))
    if not source or source[0] < 208427 or source[0] != source[1] or source[3] not in ("complete","partial"):
        raise RuntimeError("Unverified / incomplete full-universe Players source")
    pulse("verified_source", {"rows":source[0],"quarantined":source[2]})

    counts = execute("""
        SELECT count(*)::bigint,count(*) FILTER(WHERE rejection_reason IS NOT NULL)::bigint
        FROM public.tbc_players_full_feed_audit_rows WHERE run_id=%s
    """, (RUN_ID,))
    if counts != (source[0],source[2]):
        raise RuntimeError(f"Immutable captured source mismatch: {counts} vs {source}")

    candidates = execute("""
        SELECT count(*)::bigint FROM public.tbc_player_hsid_candidates
        WHERE source_run_id=%s
    """, (RUN_ID,))[0]
    if candidates == 0:
        result = execute("SELECT * FROM public.prepare_tbc_player_hsid_candidates(%s)", (RUN_ID,))
        pulse("school_identity_prepared", result)
    elif candidates != source[0]:
        raise RuntimeError("Partial school identity candidate set: stop; do not publish")
    else:
        pulse("school_identity_prepared", {"resumed": True, "rows": candidates})

    # Publish the *same* immutable source snapshot, not a live feed that can
    # change between the capture, identity and raw/card stages.
    raw_done = False
    for _ in range(MAX_BATCHES):
        done = execute("SELECT * FROM public.promote_verified_tbc_player_raw_batch(%s, %s)",
                       (RUN_ID, RAW_BATCH))
        if not done or done[1] > source[0]:
            raise RuntimeError("Invalid raw promotion progress")
        if done[3]:
            raw_done = True
            pulse("raw_complete", {"processed":done[1], "last_row":done[2]})
            break
    if not raw_done:
        raise RuntimeError("Raw promotion failed to finish within bounded batches")

    participation = execute("SELECT * FROM public.prepare_tbc_verified_2026_participation()")
    # Existing 2026 daily feed participants not present in the immutable ZIP
    # must also qualify; no assumption about their current team is made.
    daily_added = execute("""
        WITH daily AS(
            SELECT playerid FROM public.tbc_batting_2026_season_raw WHERE year='2026'
            UNION SELECT playerid FROM public.tbc_pitching_2026_season_raw WHERE year='2026'
        ), inserted AS (
            INSERT INTO public.tbc_verified_2026_participation(playerid)
            SELECT playerid FROM daily WHERE playerid IS NOT NULL
            ON CONFLICT(playerid) DO NOTHING RETURNING 1
        ) SELECT count(*)::int FROM inserted
    """)[0]
    pulse("2026_participation", {"archive":participation[0], "daily_added":daily_added})

    linked = execute("SELECT * FROM public.prepare_tbc_verified_school_links(%s)", (RUN_ID,))
    if linked[2]:
        raise RuntimeError(f"Verified school identity conflicts detected: {linked[2]}")
    pulse("school_links_prepared", {"source_candidates":linked[0], "linked":linked[1]})

    cards_done = False
    for _ in range(MAX_BATCHES):
        done = execute("SELECT * FROM public.publish_verified_tbc_flip_cards_batch(%s, %s)",
                       (RUN_ID, CARD_BATCH))
        if not done or done[3] > source[0] or done[4] > done[3]:
            raise RuntimeError("Invalid flip-card publication progress")
        if done[5]:
            cards_done = True
            pulse("cards_complete", {"processed":done[3], "created":done[4], "held":done[2]})
            break
    if not cards_done:
        raise RuntimeError("Flip-card publication did not complete within bounded batches")

    # Run the same evidence-aware 2026 college-team/status recovery that the
    # regular level-QC job uses. Fail the entire publication workflow if it
    # cannot complete; a card existing with a blank recoverable team is not done.
    subprocess.run(
        ["npx", "tsx", "./scripts/reconcile-tbc-stage-after-publication.ts"],
        check=True,
        timeout=240,
    )
    pulse("source_backed_stage_reconciliation", {"completed": True})

    # No source-backed, publishable identity is permitted to vanish between
    # raw and stage. Exception holds are recorded by player ID.
    metrics = execute("""
        WITH published AS (
          SELECT c.playerid
          FROM public.tbc_player_hsid_candidates c
          WHERE c.source_run_id=%s AND c.review_reason='UNIQUE_SCHOOL_NEEDS_CARD'
        )
        SELECT
          (SELECT COUNT(*)::bigint FROM published),
          (SELECT COUNT(*)::bigint FROM published p
           WHERE EXISTS(SELECT 1 FROM public.flip_card_front_stage f WHERE f.playerid=p.playerid)),
          (SELECT COUNT(*)::bigint FROM published p
           WHERE NOT EXISTS(SELECT 1 FROM public.flip_card_front_stage f WHERE f.playerid=p.playerid)
             AND EXISTS(SELECT 1 FROM public.tbc_flip_card_publication_holds h
                        WHERE h.source_run_id=%s AND h.playerid=p.playerid)),
          (SELECT COUNT(*)::bigint FROM published p
           WHERE NOT EXISTS(SELECT 1 FROM public.flip_card_front_stage f WHERE f.playerid=p.playerid)
             AND NOT EXISTS(SELECT 1 FROM public.tbc_flip_card_publication_holds h
                            WHERE h.source_run_id=%s AND h.playerid=p.playerid)),
          (SELECT completed FROM public.tbc_player_raw_promotion_progress WHERE source_run_id=%s),
          (SELECT completed FROM public.tbc_flip_card_publication_progress WHERE source_run_id=%s)
    """, (RUN_ID,RUN_ID,RUN_ID,RUN_ID,RUN_ID))
    result = {"publishable":metrics[0],"on_stage":metrics[1],
              "explicit_holds":metrics[2],"missing_without_hold":metrics[3],
              "raw_completed":metrics[4],"stage_completed":metrics[5],
              "quarantined_source_rows":source[2]}
    pulse("completion_audit",result)
    passed = bool(metrics[4] and metrics[5] and metrics[3] == 0
                  and metrics[0] == metrics[1] + metrics[2])
    job_health(passed,result)
    if not passed:
        raise RuntimeError("Publication completion audit failed: " + json.dumps(result))
    print("TBC_PLAYERS_END_TO_END_PUBLICATION_VERIFIED", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"PLAYER_PUBLICATION_FAILED: {error}", file=sys.stderr, flush=True)
        try:
            job_health(False,{"error":str(error),"run_id":RUN_ID})
        except Exception as report_error:
            print(f"Health recording failed: {report_error}",file=sys.stderr,flush=True)
        raise
