const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const WITH_ROSTERS = process.argv.includes("--with-rosters");

const PRESTO_DIR = process.env.PRESTO_DIR || "./presto_xmls";
const MAPPING_PATH = process.env.MAPPING_PATH || "./hamilton-mapping.json";

const OUTPUT_PARSED_GAMES = "./parsed-games.json";
const OUTPUT_PARSED_ROSTERS = "./parsed-rosters.json";
const OUTPUT_UNMATCHED = "./unmatched-teams.json";
const OUTPUT_SUGGESTIONS = "./mapping-suggestions.json";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function ensureArtifactsWhenNoFiles() {
  writeJson(OUTPUT_PARSED_GAMES, {
    ok: false,
    message: `No XML files found in ${PRESTO_DIR}`,
  });
  writeJson(OUTPUT_PARSED_ROSTERS, {
    ok: false,
    message: `No XML files found in ${PRESTO_DIR}`,
  });
  writeJson(OUTPUT_UNMATCHED, {
    ok: false,
    message: "No XML files were processed",
  });
  writeJson(OUTPUT_SUGGESTIONS, {
    ok: false,
    message: "No XML files were processed",
  });
}

function listXmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const stat = fs.statSync(dir);
  if (stat.isFile() && dir.toLowerCase().endsWith(".xml")) return [dir];
  if (!stat.isDirectory()) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".xml"))
    .map((f) => path.join(dir, f));
}

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).trim().split("/");
  if (parts.length !== 3) return null;
  const [m, d, y] = parts;
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function parseStatus(bsgame) {
  const complete = bsgame?.status?.["@_complete"];
  return complete === "Y" ? "final" : "scheduled";
}

function splitName(full) {
  const value = String(full || "").trim();
  if (!value) return { first_name: null, last_name: null };
  const parts = value.split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return {
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts[parts.length - 1],
  };
}

function buildSourceGameId(venue) {
  const date = venue?.["@_date"] || "nodate";
  const homeid = venue?.["@_homeid"] || "nohome";
  const visid = venue?.["@_visid"] || "novis";
  const start = venue?.["@_start"] || "notime";
  return `${date}_${homeid}_${visid}_${start}`;
}

function buildCollegeGameKey(teamid, sourceGameId) {
  return `${teamid}|presto|${sourceGameId}`;
}

function buildRosterPlayerKey(teamid, sourcePlayerId, playerName) {
  if (sourcePlayerId) return `${teamid}|presto|${sourcePlayerId}`;
  return `${teamid}|presto|${String(playerName || "").trim().toLowerCase()}`;
}

async function maybeLookupTeamByName(client, schoolName) {
  if (!client || !schoolName) return [];
  try {
    const result = await client.query(
      `
      select teamid, team
      from public.college_team_sources
      where lower(team) like '%' || lower($1) || '%'
      order by team
      limit 5
      `,
      [schoolName]
    );
    return result.rows || [];
  } catch (err) {
    console.error("Name lookup failed:", err.message);
    return [];
  }
}

async function upsertScheduleRow(client, row) {
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
    )
    values (
      $1,$2,$3,'presto',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
      $16,$17,$18,$19,$20,now(),now()
    )
    on conflict (college_game_key)
    do update set
      game_date = excluded.game_date,
      game_time_utc = excluded.game_time_utc,
      status = excluded.status,
      home_team_id = excluded.home_team_id,
      home_team_name = excluded.home_team_name,
      away_team_id = excluded.away_team_id,
      away_team_name = excluded.away_team_name,
      venue_name = excluded.venue_name,
      level = excluded.level,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      raw_payload = excluded.raw_payload,
      updated_at = now()
    `,
    [
      row.college_game_key,
      row.teamid,
      row.team,
      row.source_game_id,
      row.game_date,
      row.game_time_utc,
      row.status,
      row.home_team_id,
      row.home_team_name,
      row.away_team_id,
      row.away_team_name,
      row.venue_name,
      row.level,
      row.home_score,
      row.away_score,
      row.schedule_url,
      row.boxscore_url,
      row.recap_url,
      row.livestats_url,
      row.raw_payload,
    ]
  );
}

async function upsertRosterRow(client, row) {
  await client.query(
    `
    insert into public.college_roster_players_raw (
      roster_player_key,
      teamid,
      team,
      source_system,
      source_player_id,
      roster_season,
      player_name,
      first_name,
      last_name,
      jersey_number,
      position,
      class_year,
      bats,
      throws,
      headshot_url,
      bio_url,
      is_current,
      match_status,
      created_at,
      updated_at
    )
    values (
      $1,$2,$3,'presto',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,'unmatched',now(),now()
    )
    on conflict (roster_player_key)
    do update set
      player_name = excluded.player_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      jersey_number = excluded.jersey_number,
      position = excluded.position,
      class_year = excluded.class_year,
      bats = excluded.bats,
      throws = excluded.throws,
      headshot_url = excluded.headshot_url,
      bio_url = excluded.bio_url,
      updated_at = now()
    `,
    [
      row.roster_player_key,
      row.teamid,
      row.team,
      row.source_player_id,
      row.roster_season,
      row.player_name,
      row.first_name,
      row.last_name,
      row.jersey_number,
      row.position,
      row.class_year,
      row.bats,
      row.throws,
      row.headshot_url,
      row.bio_url,
    ]
  );
}

async function main() {
  const files = listXmlFiles(PRESTO_DIR);
  const mapping = readJsonSafe(MAPPING_PATH, { presto_to_team: {}, hamilton_targets: [] });
  const prestoToTeam = mapping.presto_to_team || {};

  if (!files.length) {
    console.log(`No XML files found in ${PRESTO_DIR}`);
    ensureArtifactsWhenNoFiles();
    process.exit(0);
  }

  let client = null;
  if (APPLY) {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL is required for --apply");
      process.exit(1);
    }
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
  }

  const parsedGames = [];
  const parsedRosters = [];
  const unmatchedTeams = {};
  const mappingSuggestions = {};

  for (const file of files) {
    const xml = fs.readFileSync(file, "utf8");
    const doc = parser.parse(xml);

    const bsgame = doc?.bsgame;
    if (!bsgame) {
      console.warn(`Skipping ${file}: no <bsgame> root`);
      continue;
    }

    const venue = bsgame.venue || {};
    const teams = asArray(bsgame.team);
    if (teams.length < 2) {
      console.warn(`Skipping ${file}: expected 2 <team> nodes`);
      continue;
    }

    const homePrestoId = venue?.["@_homeid"] || null;
    const awayPrestoId = venue?.["@_visid"] || null;
    const homeName = venue?.["@_homename"] || null;
    const awayName = venue?.["@_visname"] || null;
    const gameDate = normalizeDate(venue?.["@_date"]);
    const sourceGameId = buildSourceGameId(venue);
    const status = parseStatus(bsgame);
    const venueName = venue?.["@_stadium"] || venue?.["@_location"] || null;

    const homeTeamId = prestoToTeam[homePrestoId] || null;
    const awayTeamId = prestoToTeam[awayPrestoId] || null;

    if (!homeTeamId) {
      unmatchedTeams[homePrestoId || `home:${homeName}`] = {
        presto_id: homePrestoId,
        school_name: homeName,
      };
    }
    if (!awayTeamId) {
      unmatchedTeams[awayPrestoId || `away:${awayName}`] = {
        presto_id: awayPrestoId,
        school_name: awayName,
      };
    }

    if (!mappingSuggestions[homePrestoId || homeName]) {
      mappingSuggestions[homePrestoId || homeName] = {
        presto_id: homePrestoId,
        school_name: homeName,
      };
      if (client && homeName) {
        mappingSuggestions[homePrestoId || homeName].db_candidates =
          await maybeLookupTeamByName(client, homeName);
      }
    }

    if (!mappingSuggestions[awayPrestoId || awayName]) {
      mappingSuggestions[awayPrestoId || awayName] = {
        presto_id: awayPrestoId,
        school_name: awayName,
      };
      if (client && awayName) {
        mappingSuggestions[awayPrestoId || awayName].db_candidates =
          await maybeLookupTeamByName(client, awayName);
      }
    }

    const commonPayload = {
      file: path.basename(file),
      source_game_id: sourceGameId,
      game_date: gameDate,
      status,
      venue_name: venueName,
      start_local: venue?.["@_start"] || null,
      home_presto_id: homePrestoId,
      home_name: homeName,
      away_presto_id: awayPrestoId,
      away_name: awayName,
    };

    if (homeTeamId) {
      const row = {
        college_game_key: buildCollegeGameKey(homeTeamId, sourceGameId),
        teamid: String(homeTeamId),
        team: homeName,
        source_game_id: sourceGameId,
        game_date: gameDate,
        game_time_utc: null,
        status,
        home_team_id: String(homeTeamId),
        home_team_name: homeName,
        away_team_id: awayTeamId ? String(awayTeamId) : String(awayPrestoId || ""),
        away_team_name: awayName,
        venue_name: venueName,
        level: null,
        home_score: teams[0]?.linescore?.["@_runs"] || null,
        away_score: teams[1]?.linescore?.["@_runs"] || null,
        schedule_url: null,
        boxscore_url: null,
        recap_url: null,
        livestats_url: null,
        raw_payload: JSON.stringify({ venue, bsgame }),
      };
      parsedGames.push(row);
      if (APPLY && client) {
        await upsertScheduleRow(client, row);
      }
    }

    if (awayTeamId) {
      const row = {
        college_game_key: buildCollegeGameKey(awayTeamId, sourceGameId),
        teamid: String(awayTeamId),
        team: awayName,
        source_game_id: sourceGameId,
        game_date: gameDate,
        game_time_utc: null,
        status,
        home_team_id: homeTeamId ? String(homeTeamId) : String(homePrestoId || ""),
        home_team_name: homeName,
        away_team_id: String(awayTeamId),
        away_team_name: awayName,
        venue_name: venueName,
        level: null,
        home_score: teams[0]?.linescore?.["@_runs"] || null,
        away_score: teams[1]?.linescore?.["@_runs"] || null,
        schedule_url: null,
        boxscore_url: null,
        recap_url: null,
        livestats_url: null,
        raw_payload: JSON.stringify({ venue, bsgame }),
      };
      parsedGames.push(row);
      if (APPLY && client) {
        await upsertScheduleRow(client, row);
      }
    }

    // Parse roster rows from both teams for dry-run output always.
    for (const teamNode of teams) {
      const prestoId = teamNode?.["@_id"] || null;
      const mappedTeamId = prestoToTeam[prestoId] || null;
      const schoolName = teamNode?.["@_name"] || null;
      const rosterSeason = gameDate ? gameDate.slice(0, 4) : null;

      const players = asArray(teamNode.player);
      for (const p of players) {
        const playerName = p?.["@_name"] || null;
        const sourcePlayerId = p?.["@_playerId"] || null;
        const nameParts = splitName(playerName);

        const rosterRow = {
          roster_player_key: buildRosterPlayerKey(
            mappedTeamId || prestoId || schoolName,
            sourcePlayerId,
            playerName
          ),
          teamid: mappedTeamId ? String(mappedTeamId) : null,
          team: schoolName,
          presto_team_id: prestoId,
          source_player_id: sourcePlayerId,
          roster_season: rosterSeason,
          player_name: playerName,
          first_name: nameParts.first_name,
          last_name: nameParts.last_name,
          jersey_number: p?.["@_uni"] || null,
          position: p?.["@_pos"] || null,
          class_year: p?.["@_class"] || null,
          bats: p?.["@_bats"] || null,
          throws: p?.["@_throws"] || null,
          headshot_url: null,
          bio_url: null,
          file: path.basename(file),
        };

        parsedRosters.push(rosterRow);

        if (APPLY && WITH_ROSTERS && client && mappedTeamId) {
          await upsertRosterRow(client, rosterRow);
        }
      }
    }

    console.log(
      `Processed ${path.basename(file)} | ${homeName} vs ${awayName} | source_game_id=${sourceGameId}`
    );
  }

  writeJson(OUTPUT_PARSED_GAMES, parsedGames);
  writeJson(OUTPUT_PARSED_ROSTERS, parsedRosters);
  writeJson(OUTPUT_UNMATCHED, unmatchedTeams);
  writeJson(OUTPUT_SUGGESTIONS, mappingSuggestions);

  console.log(`Wrote ${OUTPUT_PARSED_GAMES}`);
  console.log(`Wrote ${OUTPUT_PARSED_ROSTERS}`);
  console.log(`Wrote ${OUTPUT_UNMATCHED}`);
  console.log(`Wrote ${OUTPUT_SUGGESTIONS}`);

  if (client) {
    await client.end();
  }

  if (APPLY) {
    console.log("APPLY mode finished.");
  } else {
    console.log("Dry run finished.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
