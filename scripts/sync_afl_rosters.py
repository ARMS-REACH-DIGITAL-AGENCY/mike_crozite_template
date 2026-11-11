#!/usr/bin/env python3
"""Overlay verified MLB Arizona Fall League active rosters on YAT?STATS cards.

Run AFTER the ordinary MLB organization roster refresh. The normal roster
pipeline remains authoritative for parent-club/affiliate assignments. During
AFL, a six-club active roster temporarily takes precedence for the visible
current team. No player/team identity or free-agent transaction rules change.
"""
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

import psycopg
from psycopg.rows import dict_row
import requests

MLB_API = "https://statsapi.mlb.com/api/v1"
AFL_TEAMS = (454, 490, 527, 542, 544, 555)
AFL_TEAM_SET = set(AFL_TEAMS)
SEASON = int(os.environ.get("AFL_SEASON", str(date.today().year)))
DATABASE_URL = os.environ["DATABASE_URL"]
DRY_RUN = "--dry-run" in sys.argv

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS public.afl_current_roster_overlays (
    playerid text PRIMARY KEY,
    mlb_player_id text NOT NULL,
    season integer NOT NULL,
    afl_mlb_team_id integer NOT NULL,
    previous_team_state jsonb NOT NULL,
    active boolean NOT NULL DEFAULT true,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
"""

# One verified MLB identity points to the same existing TBC player card.
# A 2026 AFL game played under that SAME TBC ID is acceptable corroboration
# of an older, not-yet-verified MLB crosswalk, but a rejected identity never is.
# Both the roster and canonical mapping must agree on the exact MLB team ID.
MAP_PLAYERS = """
WITH roster AS (
  SELECT DISTINCT x.mlb_player_id, x.afl_mlb_team_id
  FROM jsonb_to_recordset(%s::jsonb)
    AS x(mlb_player_id text, afl_mlb_team_id integer)
),
candidates AS (
  SELECT m.playerid::text AS playerid, r.mlb_player_id,
         r.afl_mlb_team_id, u.teamid, u.current_team_name,
         u.current_org_or_conference_name, u.level_label
  FROM roster r
  JOIN public.player_source_map m
    ON m.source = 'mlb_api' AND m.source_player_id = r.mlb_player_id
  JOIN public.flip_card_front_stage f ON f.playerid::text = m.playerid::text
  JOIN public.team_id_map tim ON tim.mlb_stats_api_id = r.afl_mlb_team_id
  JOIN public.teamid_universe_mapping u ON u.teamid = tim.tbc_teamid
  WHERE m.match_method IS DISTINCT FROM 'rejected_bad_identity_match'
    AND (m.is_verified IS TRUE OR EXISTS (
      SELECT 1 FROM public.player_game_logs gl
       WHERE gl.playerid::text = m.playerid::text
         AND gl.source_team_id = r.afl_mlb_team_id::text
         AND gl.game_date >= make_date(%s, 1, 1)
         AND gl.game_date < make_date(%s + 1, 1, 1)
    ))
    AND f.last_transaction_applied_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.player_team_override o
       WHERE o.playerid::text = f.playerid::text
    )
),
unambiguous AS (
  SELECT playerid
    FROM candidates
   GROUP BY playerid
  HAVING count(DISTINCT mlb_player_id) = 1
     AND count(DISTINCT afl_mlb_team_id) = 1
)
SELECT DISTINCT c.*
FROM candidates c JOIN unambiguous x USING (playerid)
ORDER BY c.playerid;
"""

INSERT_OVERLAYS = """
INSERT INTO public.afl_current_roster_overlays
  (playerid, mlb_player_id, season, afl_mlb_team_id,
   previous_team_state, active, last_seen_at, updated_at)
SELECT f.playerid, x.mlb_player_id, %s, x.afl_mlb_team_id,
       jsonb_build_object(
         'current_teamid', f.current_teamid,
         'current_team_name', f.current_team_name,
         'current_org_or_conference_name', f.current_org_or_conference_name,
         'current_team_source', f.current_team_source,
         'current_team_source_player_id', f.current_team_source_player_id,
         'current_team_source_team_id', f.current_team_source_team_id,
         'current_team_roster_status', f.current_team_roster_status,
         'current_team_last_verified', f.current_team_last_verified,
         'current_team_level', f.current_team_level,
         'current_level_label', f.current_level_label,
         'level_label', f.level_label,
         'display_level_label', f.display_level_label,
         'status_label', f.status_label,
         'display_status_label', f.display_status_label,
         'current_team_affiliation', f.current_team_affiliation
       ),
       true, now(), now()
FROM jsonb_to_recordset(%s::jsonb)
 AS x(playerid text, mlb_player_id text, afl_mlb_team_id integer)
JOIN public.flip_card_front_stage f ON f.playerid = x.playerid
WHERE f.current_team_source IS DISTINCT FROM 'mlb_api_afl'
ON CONFLICT (playerid) DO UPDATE
  SET mlb_player_id = excluded.mlb_player_id,
      season = excluded.season,
      afl_mlb_team_id = excluded.afl_mlb_team_id,
      last_seen_at = now(),
      active = true,
      updated_at = now(),
      previous_team_state = CASE
        WHEN public.afl_current_roster_overlays.season <> excluded.season
          OR public.afl_current_roster_overlays.active IS FALSE
        THEN excluded.previous_team_state
        ELSE public.afl_current_roster_overlays.previous_team_state
      END;
"""

# Reactivate an overlay if the preceding ordinary roster sync already gave
# the card its normal affiliate, and retain its original snapshot for rollback.
REACTIVATE_OVERLAYS = """
UPDATE public.afl_current_roster_overlays a
SET mlb_player_id = x.mlb_player_id, season = %s,
    afl_mlb_team_id = x.afl_mlb_team_id, last_seen_at = now(),
    active = true, updated_at = now()
FROM jsonb_to_recordset(%s::jsonb)
 AS x(playerid text, mlb_player_id text, afl_mlb_team_id integer)
WHERE a.playerid = x.playerid;
"""

APPLY_ROSTERS = """
UPDATE public.flip_card_front_stage f
   SET current_teamid = u.teamid,
       current_team_name = u.current_team_name,
       current_org_or_conference_name = u.current_org_or_conference_name,
       current_team_affiliation = u.current_org_or_conference_name,
       current_team_source = 'mlb_api_afl',
       current_team_source_player_id = a.mlb_player_id,
       current_team_source_team_id = a.afl_mlb_team_id::text,
       current_team_roster_status = 'Active',
       current_team_last_verified = now(),
       current_team_level = u.level_label,
       current_level_label = u.level_label,
       level_label = u.level_label,
       display_level_label = u.level_label,
       status_label = 'ACTIVE',
       display_status_label = 'ACTIVE',
       next_game_date = CASE WHEN ng.game_time_utc IS NOT NULL
         THEN to_char(ng.game_time_utc AT TIME ZONE
           coalesce(f.school_timezone, 'America/Phoenix'),
           'FMDay | FMMonth DD, YYYY') ELSE NULL END,
       next_game_time_local = CASE WHEN ng.game_time_utc IS NOT NULL
         THEN to_char(ng.game_time_utc AT TIME ZONE
           coalesce(f.school_timezone, 'America/Phoenix'),
           'FMHH12:MI AM') ELSE NULL END,
       next_game_time_utc = ng.game_time_utc,
       next_game_home_away = ng.home_away,
       next_game_opponent = ng.opponent,
       next_game_status_label = ng.status_label,
       stage_updated_at = now()
FROM public.afl_current_roster_overlays a
JOIN public.team_id_map tim ON tim.mlb_stats_api_id = a.afl_mlb_team_id
JOIN public.teamid_universe_mapping u ON u.teamid = tim.tbc_teamid
LEFT JOIN LATERAL (
 SELECT ts.game_time_utc,
        CASE WHEN ts.away_team_id = a.afl_mlb_team_id
          THEN '@' ELSE 'vs.' END AS home_away,
        CASE WHEN ts.away_team_id = a.afl_mlb_team_id
          THEN ts.home_team_name ELSE ts.away_team_name END AS opponent,
        CASE WHEN lower(coalesce(ts.status, '')) IN ('in progress', 'manager challenge')
          THEN 'IN PROGRESS' ELSE 'NEXT GAME' END AS status_label
 FROM public.team_schedules ts
 WHERE a.afl_mlb_team_id IN (ts.home_team_id, ts.away_team_id)
   AND ts.sport_id = 17
   AND lower(coalesce(ts.status, '')) IN
     ('scheduled', 'preview', 'pre-game', 'warmup',
      'delayed start', 'delayed', 'in progress', 'manager challenge')
   AND (ts.game_time_utc > now() OR lower(coalesce(ts.status, ''))
        IN ('in progress', 'manager challenge'))
 ORDER BY CASE WHEN lower(coalesce(ts.status, '')) IN
                   ('in progress', 'manager challenge') THEN 0 ELSE 1 END,
          ts.game_time_utc ASC
 LIMIT 1
) ng ON true
WHERE f.playerid = a.playerid
  AND a.active = true AND a.season = %s
  AND f.last_transaction_applied_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.player_team_override o WHERE o.playerid = f.playerid
  );
"""

RESTORE_ROSTERS = """
UPDATE public.flip_card_front_stage f
SET current_teamid = a.previous_team_state ->> 'current_teamid',
    current_team_name = a.previous_team_state ->> 'current_team_name',
    current_org_or_conference_name =
      a.previous_team_state ->> 'current_org_or_conference_name',
    current_team_affiliation =
      a.previous_team_state ->> 'current_team_affiliation',
    current_team_source = a.previous_team_state ->> 'current_team_source',
    current_team_source_player_id =
      a.previous_team_state ->> 'current_team_source_player_id',
    current_team_source_team_id =
      a.previous_team_state ->> 'current_team_source_team_id',
    current_team_roster_status =
      a.previous_team_state ->> 'current_team_roster_status',
    current_team_last_verified =
      (a.previous_team_state ->> 'current_team_last_verified')::timestamptz,
    current_team_level = a.previous_team_state ->> 'current_team_level',
    current_level_label = a.previous_team_state ->> 'current_level_label',
    level_label = a.previous_team_state ->> 'level_label',
    display_level_label = a.previous_team_state ->> 'display_level_label',
    status_label = a.previous_team_state ->> 'status_label',
    display_status_label = a.previous_team_state ->> 'display_status_label',
    next_game_date = null, next_game_time_local = null,
    next_game_time_utc = null, next_game_home_away = null,
    next_game_opponent = null, next_game_status_label = null,
    stage_updated_at = now()
FROM public.afl_current_roster_overlays a
WHERE a.playerid = f.playerid
  AND a.active = true
  AND f.current_team_source = 'mlb_api_afl'
  AND f.last_transaction_applied_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.player_team_override o WHERE o.playerid = f.playerid
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_to_recordset(%s::jsonb)
      AS r(playerid text) WHERE r.playerid = a.playerid
  );
"""

DEACTIVATE_ABSENT = """
UPDATE public.afl_current_roster_overlays a
SET active = false, updated_at = now()
WHERE a.active = true
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_to_recordset(%s::jsonb)
      AS r(playerid text) WHERE r.playerid = a.playerid
  );
"""


def fetch_afl_rosters() -> list[dict]:
    session = requests.Session()
    all_players: dict[str, dict] = {}
    counts = []
    for team_id in AFL_TEAMS:
        url = f"{MLB_API}/teams/{team_id}/roster"
        response = session.get(url, params={
            "rosterType": "active", "season": str(SEASON)
        }, timeout=45)
        response.raise_for_status()
        roster = response.json().get("roster")
        if not isinstance(roster, list):
            raise RuntimeError(f"Missing active roster for AFL club {team_id}")
        counts.append(f"{team_id}:{len(roster)}")
        for player in roster:
            mlb_id = player.get("person", {}).get("id")
            if mlb_id is None:
                continue
            key = str(mlb_id)
            if key in all_players and all_players[key]["afl_mlb_team_id"] != team_id:
                raise RuntimeError(f"Conflicting AFL assignments for MLB person {key}")
            all_players[key] = {"mlb_player_id": key, "afl_mlb_team_id": team_id}
    print(f"AFL {SEASON} active roster sizes: {', '.join(counts)}; "
          f"{len(all_players)} distinct MLB identities")
    return list(all_players.values())


def main() -> None:
    today = datetime.now(timezone.utc).date()
    if today.month < 9 and SEASON == today.year:
        print("Before AFL season. Will only restore any prior-year stale overlays.")
        rosters = []
    else:
        rosters = fetch_afl_rosters()

    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # A zero-player roster during the season is usually a feed failure;
            # don't replace hundreds of legitimate assignments with blanks.
            if 9 <= today.month <= 11 and not rosters:
                raise RuntimeError("All six AFL active rosters empty during Fall League; "
                                   "refusing unsafe bulk removal")
            if DRY_RUN:
                if rosters:
                    cur.execute(MAP_PLAYERS, (json.dumps(rosters), SEASON, SEASON))
                    rows = cur.fetchall()
                    print(f"DRY RUN: {len(rows)} unique verified or game-corroborated YAT cards; "
                          "no writes.")
                return

            cur.execute(CREATE_TABLE)
            if rosters:
                cur.execute(MAP_PLAYERS, (json.dumps(rosters), SEASON, SEASON))
                candidates = cur.fetchall()
            else:
                candidates = []
            matches = [{"playerid": r["playerid"],
                        "mlb_player_id": r["mlb_player_id"],
                        "afl_mlb_team_id": r["afl_mlb_team_id"]}
                       for r in candidates]
            payload = json.dumps(matches)
            print(f"AFL linked flip cards eligible for assignment: {len(matches)}")
            if matches:
                cur.execute(INSERT_OVERLAYS, (SEASON, payload))
                cur.execute(REACTIVATE_OVERLAYS, (SEASON, payload))
            cur.execute(RESTORE_ROSTERS, (payload,))
            print(f"Former AFL assignments restored to prior regular roster: {cur.rowcount}")
            cur.execute(DEACTIVATE_ABSENT, (payload,))
            if matches:
                cur.execute(APPLY_ROSTERS, (SEASON,))
                print(f"AFL flip cards refreshed (including correct next games): {cur.rowcount}")
        conn.commit()


if __name__ == "__main__":
    main()
