#!/usr/bin/env python3
"""Export the inputs of scripts/simulate-bracket-2026.ts from the database.

Read-only. Pro players only (MLB to ROOKIE; Pete, Nov 19 2026): every
alumnus of the 1,024 field schools, his real 2026 game lines
(player_game_logs, MLB Stats API, regular season and postseason, Feb 2 -
Sep 27), the team he was on each day (player_team_stints), and every team's
real results (team_schedules: MLB's final scores). Nothing is simulated or
filled in: a day with no final score adds no win and no loss. College files
are written empty (headers only). Spring training is not stored, so the run
uses --no-spring.

The field and seeds come from the earlier 2026 run
(public/bracket-lab/2026/index.json, Round 1), so both runs play the same
bracket.

Usage (SQL over Neon's HTTP endpoint; CT_CONN = the database URL):
  CT_CONN=... python3 scripts/export-bracket-sim-2026.py <out-dir>
"""
import json, os, sys, urllib.request

CONN = os.environ['CT_CONN']
HOST = CONN.split('@')[1].split('/')[0]
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

FIRST, LAST = '2026-02-02', '2026-09-27'
LEVELS = {'MLB': 'MLB', 'AAA': 'TRIPLE-A', 'AA': 'DOUBLE-A', 'A+': 'HIGH-A', 'A': 'SINGLE-A', 'ROK': 'ROOKIE'}
PRO = tuple(LEVELS.values())


def sql(q, params=None):
    body = json.dumps({'query': q, 'params': params or []}).encode()
    req = urllib.request.Request(f'https://{HOST}/sql', data=body,
                                 headers={'Neon-Connection-String': CONN, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=900) as r:
        return json.load(r)['rows']


def write(name, sep, header, rows):
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(sep.join(header) + '\n')
        for r in rows:
            f.write(sep.join('' if r.get(h) is None else str(r[h]).replace(sep, ' ') for h in header) + '\n')
    print(f'{name}: {len(rows)} rows')


# 1. The field: Round 1 of the earlier run.
idx = json.load(open('public/bracket-lab/2026/index.json'))
names = {int(k): (v[0] if isinstance(v, list) else v.get('name', '')) for k, v in idx['schools'].items()} if isinstance(idx['schools'], dict) else {}
seeds = []
for s in idx['rounds'][0]['series']:
    region, home, away, hseed, aseed = s[0], s[1], s[2], s[3], s[4]
    seeds.append({'region': region, 'home_hsid': home, 'home_name': names.get(home, ''), 'home_seed': hseed,
                  'visitor_hsid': away, 'visitor_name': names.get(away, ''), 'visitor_seed': aseed})
write('seeds.psv', '|', ['region', 'home_hsid', 'home_name', 'home_seed', 'visitor_hsid', 'visitor_name', 'visitor_seed'], seeds)
field = sorted({r['home_hsid'] for r in seeds} | {r['visitor_hsid'] for r in seeds})
field_arr = '{' + ','.join(str(h) for h in field) + '}'

# 2. Each field school's alumni: the person (YAT ID) and his school (his card).
players = sql("""SELECT yatid, hsid::int AS hsid, display_name AS name
                   FROM flip_card_front_stage
                  WHERE yatid IS NOT NULL AND hsid::text ~ '^[0-9]+$' AND hsid::int = ANY($1::int[])""", [field_arr])
school = {p['yatid']: p['hsid'] for p in players}
write('names.psv', '|', ['playerid', 'name'], [{'playerid': p['yatid'], 'name': p['name']} for p in players])
ids = '{' + ','.join(school) + '}'

# 3. Real game lines, MLB to ROOKIE (newest copy of each game line).
base = """SELECT DISTINCT ON (yatid, source_game_id, stat_type)
                 yatid, game_date::text AS date, team_name, raw_payload->'sport'->>'abbreviation' AS sport, stats
            FROM player_game_logs
           WHERE yatid = ANY($1::text[]) AND stat_type = $2 AND game_date BETWEEN $3::date AND $4::date
             AND raw_payload->'sport'->>'abbreviation' = ANY($5::text[])
           ORDER BY yatid, source_game_id, stat_type, updated_at DESC"""
sports = '{' + ','.join('"%s"' % k for k in LEVELS) + '}'
bat, pit = [], []
for r in sql(base, [ids, 'batting', FIRST, LAST, sports]):
    s = r['stats'] or {}
    bat.append({'playerid': r['yatid'], 'hsid': school[r['yatid']], 'date': r['date'], 'level': LEVELS[r['sport']],
                'teamid': r['team_name'], 'pa': s.get('plateAppearances', 0), 'ab': s.get('atBats', 0), 'h': s.get('hits', 0),
                'd2': s.get('doubles', 0), 'd3': s.get('triples', 0), 'hr': s.get('homeRuns', 0), 'bb': s.get('baseOnBalls', 0),
                'hbp': s.get('hitByPitch', 0), 'sf': s.get('sacFlies', 0)})
for r in sql(base, [ids, 'pitching', FIRST, LAST, sports]):
    s = r['stats'] or {}
    pit.append({'playerid': r['yatid'], 'hsid': school[r['yatid']], 'date': r['date'], 'level': LEVELS[r['sport']],
                'teamid': r['team_name'], 'outs': s.get('outs', 0), 'hr': s.get('homeRuns', 0), 'bb': s.get('baseOnBalls', 0),
                'hbp': s.get('hitBatsmen', s.get('hitByPitch', 0)), 'so': s.get('strikeOuts', 0), 'h': s.get('hits', 0),
                'r': s.get('runs', 0), 'er': s.get('earnedRuns', 0)})
write('pro_bat.csv', ',', ['playerid', 'hsid', 'date', 'level', 'teamid', 'pa', 'ab', 'h', 'd2', 'd3', 'hr', 'bb', 'hbp', 'sf'], bat)
write('pro_pit.csv', ',', ['playerid', 'hsid', 'date', 'level', 'teamid', 'outs', 'hr', 'bb', 'hbp', 'so', 'h', 'r', 'er'], pit)

# 4. The team he was on, from when to when (pro stints only).
stints = sql("""SELECT yatid, team_name, level, greatest(stint_start, $2::date)::text AS start,
                       least(coalesce(stint_end, $3::date), $3::date)::text AS "end"
                  FROM player_team_stints
                 WHERE season = 2026 AND yatid = ANY($1::text[]) AND level = ANY($4::text[])
                   AND coalesce(stint_end, $3::date) >= $2::date AND stint_start <= $3::date""",
             [ids, FIRST, LAST, '{' + ','.join('"%s"' % l for l in PRO) + '}'])
write('stints.csv', ',', ['playerid', 'hsid', 'teamid', 'level', 'start', 'end'],
      [{'playerid': s['yatid'], 'hsid': school[s['yatid']], 'teamid': s['team_name'], 'level': s['level'],
        'start': s['start'], 'end': s['end']} for s in stints])

# 5. Every team's real results: MLB's final scores (a doubleheader counts twice).
results = sql("""WITH g AS (
                   SELECT game_date::text AS date, home_team_name AS team, (home_score > away_score)::int AS w, (home_score < away_score)::int AS l
                     FROM team_schedules
                    WHERE game_date BETWEEN $1::date AND $2::date AND status ILIKE 'final%'
                      AND home_score IS NOT NULL AND away_score IS NOT NULL AND home_score <> away_score
                   UNION ALL
                   SELECT game_date::text, away_team_name, (away_score > home_score)::int, (away_score < home_score)::int
                     FROM team_schedules
                    WHERE game_date BETWEEN $1::date AND $2::date AND status ILIKE 'final%'
                      AND home_score IS NOT NULL AND away_score IS NOT NULL AND home_score <> away_score)
                 SELECT team, date, sum(w)::int AS w, sum(l)::int AS l FROM g GROUP BY team, date""", [FIRST, LAST])
write('team_results.csv', ',', ['teamid', 'date', 'w', 'l'], [{'teamid': r['team'], 'date': r['date'], 'w': r['w'], 'l': r['l']} for r in results])

# 6. No college (Pete, Nov 19 2026): headers only.
for f in ('col_bat.psv', 'col_pit.psv'):
    write(f, '|', ['playerid', 'hsid', 'level', 'g', 'pa', 'ab', 'h', 'd2', 'd3', 'hr', 'bb', 'hbp', 'sf', 'ip', 'so', 'r', 'er'], [])
