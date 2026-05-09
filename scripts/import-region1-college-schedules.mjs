import { Pool } from 'pg';
import crypto from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
const DRY_RUN = process.env.DRY_RUN === 'true';
const SEED_FLIP_CARD_STAGE = process.env.SEED_FLIP_CARD_STAGE !== 'false';

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL or NEON_DATABASE_URL secret.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

const REGION_1_TEAM_FILTER_SQL = `
  (
    source_system = 'manual_schedule_links_njcaa_region_1'
    or lower(coalesce(current_org_or_conference_name, '')) like '%accac%'
    or lower(coalesce(current_org_or_conference_name, '')) like '%region 1%'
    or lower(coalesce(current_team_name, '')) like '%arizona western%'
    or lower(coalesce(current_team_name, '')) like '%south mountain%'
    or lower(coalesce(current_team_name, '')) like '%chandler-gilbert%'
    or lower(coalesce(current_team_name, '')) like '%chandler gilbert%'
    or lower(coalesce(current_team_name, '')) like '%cochise%'
    or lower(coalesce(current_team_name, '')) like '%southern nevada%'
    or lower(coalesce(current_team_name, '')) like '%central arizona%'
    or lower(coalesce(current_team_name, '')) like '%gateway%'
    or lower(coalesce(current_team_name, '')) like '%pima%'
    or lower(coalesce(current_team_name, '')) like '%phoenix%'
    or lower(coalesce(current_team_name, '')) like '%mesa%'
    or lower(coalesce(current_team_name, '')) like '%yavapai%'
    or lower(coalesce(current_team_name, '')) like '%scottsdale%'
    or lower(coalesce(current_team_name, '')) like '%glendale%'
    or lower(coalesce(current_team_name, '')) like '%paradise valley%'
    or lower(coalesce(current_team_name, '')) like '%eastern arizona%'
  )
`;

function cleanText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(baseUrl, href) {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseDateToIso(value) {
  if (!value) return null;
  const cleaned = cleanText(value);
  const direct = new Date(cleaned);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);

  const md = cleaned.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (!md) return null;

  const now = new Date();
  const month = Number(md[1]);
  const day = Number(md[2]);
  let year = md[3] ? Number(md[3]) : now.getUTCFullYear();
  if (year < 100) year += 2000;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseTimeToUtc(dateIso, value) {
  if (!dateIso || !value) return null;
  const cleaned = cleanText(value).toUpperCase();
  if (!cleaned || cleaned === 'TBA' || cleaned === 'TBD') return null;

  const match = cleaned.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || '0');
  const meridiem = match[3];
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  const date = new Date(`${dateIso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-07:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stableGameKey({ teamid, date, opponent, homeAway }) {
  return crypto
    .createHash('sha1')
    .update([teamid, date || '', opponent || '', homeAway || ''].join('|'))
    .digest('hex');
}

function stripScripts(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

function parseJsonLdGames(html, source) {
  const games = [];
  const matches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const date = parseDateToIso(item.startDate || item.date || item.eventDate);
        const opponent = cleanText(item.name || item.description || '');
        if (!date || !opponent) continue;
        games.push(buildGame(source, { date, timeText: item.startDate || '', opponent, homeAway: null, status: 'scheduled', raw: item }));
      }
    } catch {}
  }
  return games;
}

function extractHref(block, labels) {
  for (const label of labels) {
    const re = new RegExp(`<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*${label}[^<]*<\\/a>`, 'i');
    const match = block.match(re);
    if (match) return match[1];
  }
  return null;
}

function parsePrestoScheduleHtml(html, source) {
  const games = [];
  const cleaned = stripScripts(html);

  const rowMatches = [
    ...cleaned.matchAll(/<tr[\s\S]*?<\/tr>/gi),
    ...cleaned.matchAll(/<li[\s\S]*?<\/li>/gi),
    ...cleaned.matchAll(/<div[^>]+class=["'][^"']*(?:event|game|schedule)[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi),
  ];

  for (const match of rowMatches) {
    const block = match[0];
    const text = cleanText(block);
    if (!text) continue;
    if (!/(\d{1,2}[/-]\d{1,2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(text)) continue;
    if (!/( vs | at |@|Final|TBA|AM|PM|Cancelled|Canceled|Postponed)/i.test(text)) continue;

    const date = parseDateToIso(text);
    if (!date) continue;

    const timeMatch = text.match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/i);
    const timeText = timeMatch?.[0] || '';

    let homeAway = null;
    let opponent = '';

    const vsMatch = text.match(/(?:^|\s)(vs\.?|at|@)\s+([^|,]+?)(?:\s+(?:Final|TBA|Cancelled|Canceled|Postponed|\d{1,2}:\d{2}|\d{1,2}\s*(?:AM|PM))|$)/i);
    if (vsMatch) {
      homeAway = /^at|@$/.test(vsMatch[1].toLowerCase()) ? 'AWAY' : 'HOME';
      opponent = cleanText(vsMatch[2]);
    } else {
      const afterDate = text.replace(/^.*?\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i, '').trim();
      opponent = cleanText(afterDate.split(/\b(Final|TBA|Cancelled|Canceled|Postponed|\d{1,2}:\d{2}|\d{1,2}\s*(?:AM|PM))\b/i)[0]);
    }

    opponent = opponent
      .replace(/^Baseball\s*/i, '')
      .replace(/^Men's Baseball\s*/i, '')
      .replace(/^vs\.?\s+/i, '')
      .replace(/^at\s+/i, '')
      .replace(/^@\s+/i, '')
      .trim();

    if (!opponent || opponent.length < 2) continue;
    if (opponent.toLowerCase() === String(source.team || '').toLowerCase()) continue;

    let status = 'scheduled';
    if (/\bfinal\b/i.test(text)) status = 'final';
    if (/cancelled|canceled/i.test(text)) status = 'canceled';
    if (/postponed/i.test(text)) status = 'postponed';

    games.push(buildGame(source, {
      date,
      timeText,
      opponent,
      homeAway,
      status,
      boxscoreUrl: absoluteUrl(source.schedule_url, extractHref(block, ['Box Score', 'Boxscore'])),
      recapUrl: absoluteUrl(source.schedule_url, extractHref(block, ['Recap'])),
      raw: { text, html: block.slice(0, 5000) },
    }));
  }

  return games;
}

function buildGame(source, input) {
  const date = input.date;
  const opponent = cleanText(input.opponent);
  const homeAway = input.homeAway || null;
  const homeTeamName = homeAway === 'AWAY' ? opponent : source.team;
  const awayTeamName = homeAway === 'AWAY' ? source.team : opponent;

  return {
    college_game_key: stableGameKey({ teamid: source.teamid, date, opponent, homeAway }),
    teamid: String(source.teamid),
    team: source.team,
    source_system: source.source_system || 'manual_schedule_links_njcaa_region_1',
    source_game_id: null,
    game_date: date,
    game_time_utc: parseTimeToUtc(date, input.timeText),
    status: input.status || 'scheduled',
    home_team_id: null,
    home_team_name: homeTeamName || null,
    away_team_id: null,
    away_team_name: awayTeamName || null,
    venue_name: null,
    level: 'JUCO',
    home_score: null,
    away_score: null,
    schedule_url: source.schedule_url,
    boxscore_url: input.boxscoreUrl || null,
    recap_url: input.recapUrl || null,
    livestats_url: input.livestatsUrl || null,
    raw_payload: input.raw || {},
  };
}

function dedupeGames(games) {
  const seen = new Set();
  return games.filter((game) => {
    if (!game.game_date || !game.teamid || !game.away_team_name || !game.home_team_name) return false;
    if (seen.has(game.college_game_key)) return false;
    seen.add(game.college_game_key);
    return true;
  });
}

async function getSources() {
  const { rows } = await pool.query(`
    select
      teamid,
      current_team_name as team,
      coalesce(source_system, 'manual_schedule_links_njcaa_region_1') as source_system,
      coalesce(
        nullif(trim(schedule_url), ''),
        nullif(trim(schedule_rss_feed), ''),
        nullif(trim(conference_schedule_url), '')
      ) as schedule_url
    from public.teamid_universe_mapping
    where coalesce(
        nullif(trim(schedule_url), ''),
        nullif(trim(schedule_rss_feed), ''),
        nullif(trim(conference_schedule_url), '')
      ) is not null
      and ${REGION_1_TEAM_FILTER_SQL}
    order by current_team_name
  `);
  return rows;
}

async function upsertGame(client, game) {
  await client.query(
    `
    insert into public.college_schedule_games_raw (
      college_game_key,
      teamid,
      team,
      source_system,
      source_game_id,
      game_date,
      game_time_utc,
      status,
      home_team_id,
      home_team_name,
      away_team_id,
      away_team_name,
      venue_name,
      level,
      home_score,
      away_score,
      schedule_url,
      boxscore_url,
      recap_url,
      livestats_url,
      raw_payload,
      created_at,
      updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,now(),now()
    )
    on conflict (college_game_key) do update set
      game_date = excluded.game_date,
      game_time_utc = excluded.game_time_utc,
      status = excluded.status,
      home_team_name = excluded.home_team_name,
      away_team_name = excluded.away_team_name,
      venue_name = excluded.venue_name,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      schedule_url = excluded.schedule_url,
      boxscore_url = excluded.boxscore_url,
      recap_url = excluded.recap_url,
      livestats_url = excluded.livestats_url,
      raw_payload = excluded.raw_payload,
      updated_at = now()
    `,
    [
      game.college_game_key,
      game.teamid,
      game.team,
      game.source_system,
      game.source_game_id,
      game.game_date,
      game.game_time_utc,
      game.status,
      game.home_team_id,
      game.home_team_name,
      game.away_team_id,
      game.away_team_name,
      game.venue_name,
      game.level,
      game.home_score,
      game.away_score,
      game.schedule_url,
      game.boxscore_url,
      game.recap_url,
      game.livestats_url,
      JSON.stringify(game.raw_payload || {}),
    ],
  );
}

async function seedFlipCardFrontStage(client) {
  const result = await client.query(`
    with valid_games as (
      select
        g.*,
        case
          when lower(trim(g.home_team_name)) = lower(trim(g.team)) then 'HOME'
          when lower(trim(g.away_team_name)) = lower(trim(g.team)) then 'AWAY'
          else null
        end as calc_home_away,
        case
          when lower(trim(g.home_team_name)) = lower(trim(g.team)) then nullif(trim(g.away_team_name), '')
          when lower(trim(g.away_team_name)) = lower(trim(g.team)) then nullif(trim(g.home_team_name), '')
          else null
        end as calc_opponent
      from public.college_schedule_games_raw g
      where g.teamid is not null
        and g.game_date >= current_date
        and lower(coalesce(g.status, 'scheduled')) not in ('final', 'cancelled', 'canceled')
        and not (
          lower(coalesce(g.home_team_name, '')) = lower(coalesce(g.away_team_name, ''))
          and coalesce(g.home_team_name, '') <> ''
        )
    ),
    ranked_games as (
      select
        *,
        row_number() over (
          partition by teamid::text
          order by game_date asc, game_time_utc asc nulls last
        ) as rn
      from valid_games
      where calc_opponent is not null
    ),
    next_games as (
      select * from ranked_games where rn = 1
    )
    update public.flip_card_front_stage f
    set
      next_game_date = ng.game_date::text,
      next_game_time_utc = ng.game_time_utc,
      next_game_time_local = null,
      next_game_home_away = ng.calc_home_away,
      next_game_opponent = ng.calc_opponent,
      next_game_status_label = upper(coalesce(ng.status, 'SCHEDULED')),
      source_refresh_at = now(),
      source_notes = concat_ws(
        ' | ',
        'github workflow region1 college schedule seed',
        'teamid=' || ng.teamid::text,
        'team=' || coalesce(ng.team, ''),
        'source=' || coalesce(ng.source_system, '')
      ),
      source_summary = jsonb_build_object(
        'seed_type', 'region1_college_next_game',
        'source_table', 'college_schedule_games_raw',
        'source_system', ng.source_system,
        'teamid', ng.teamid,
        'team', ng.team,
        'game_date', ng.game_date,
        'game_time_utc', ng.game_time_utc,
        'home_away', ng.calc_home_away,
        'opponent', ng.calc_opponent,
        'venue_name', ng.venue_name,
        'schedule_url', ng.schedule_url,
        'boxscore_url', ng.boxscore_url,
        'recap_url', ng.recap_url,
        'livestats_url', ng.livestats_url,
        'seeded_at', now()
      ),
      updated_at = now(),
      stage_updated_at = now()
    from next_games ng
    where f.current_team_source_team_id::text = ng.teamid::text
      and upper(coalesce(f.level_label, f.display_level_label, f.current_team_level, '')) in (
        'NCAA-D1', 'NCAA-D2', 'NCAA-D3', 'NAIA', 'JUCO', 'NJCAA', 'COLLEGE'
      )
  `);
  return result.rowCount || 0;
}

async function main() {
  const client = await pool.connect();
  try {
    const sources = await getSources();
    console.log(`Found ${sources.length} Region 1/JUCO schedule sources.`);

    let extractedTotal = 0;
    let insertedTotal = 0;

    await client.query('begin');

    for (const source of sources) {
      console.log(`\n${source.teamid} ${source.team}`);
      console.log(`  ${source.schedule_url}`);

      try {
        const response = await fetch(source.schedule_url, {
          headers: {
            'user-agent': 'YATSTATS Region 1 schedule importer (+https://yatstats.com)',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        if (!response.ok) {
          console.log(`  skipped: HTTP ${response.status}`);
          continue;
        }

        const html = await response.text();
        const games = dedupeGames([
          ...parseJsonLdGames(html, source),
          ...parsePrestoScheduleHtml(html, source),
        ]);

        console.log(`  extracted ${games.length} games`);
        extractedTotal += games.length;

        if (!DRY_RUN) {
          for (const game of games) {
            await upsertGame(client, game);
            insertedTotal += 1;
          }
        }
      } catch (error) {
        console.log(`  failed: ${error?.message || error}`);
      }
    }

    let seededCards = 0;
    if (!DRY_RUN && SEED_FLIP_CARD_STAGE) {
      seededCards = await seedFlipCardFrontStage(client);
    }

    if (DRY_RUN) {
      await client.query('rollback');
      console.log('\nDRY_RUN=true. Rolled back without writing rows.');
    } else {
      await client.query('commit');
      console.log('\nCommitted importer results.');
    }

    console.log(`Extracted games: ${extractedTotal}`);
    console.log(`Upserted games: ${insertedTotal}`);
    console.log(`Seeded flip_card_front_stage rows: ${seededCards}`);
  } catch (error) {
    await client.query('rollback');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
