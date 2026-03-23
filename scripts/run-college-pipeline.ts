import { Client } from "pg";
import { runDiscovery } from "./discover-college-team-sources";
import { runIngestCollegeRosters } from "./ingest-college-rosters";
import { runMatchCollegeRosterPlayers } from "./match-college-roster-players";

type Options = {
  dryRun: boolean;
  teamId?: string;
  runDiscovery: boolean;
  runIngest: boolean;
  runMatch: boolean;
  seedProofSet: boolean;
};

type ProofSeed = {
  teamid: string;
  source_system: "presto" | "sidearm" | "wmt";
  team_site_url: string;
  roster_url: string;
  schedule_url: string | null;
  schedule_alt_url: string | null;
  calendar_feed_url: string | null;
};

const PROOF_SCHOOLS: ProofSeed[] = [
  {
    teamid: "20222",
    source_system: "presto",
    team_site_url: "https://www.vaquerosports.com",
    roster_url: "https://www.vaquerosports.com/sports/bsb/2025-26/roster",
    schedule_url: "https://www.vaquerosports.com/sports/bsb/2025-26/schedule",
    schedule_alt_url:
      "https://www.vaquerosports.com/sports/bsb/2025-26/schedule?dec=printer-decorator",
    calendar_feed_url: null,
  },
  {
    teamid: "21264",
    source_system: "sidearm",
    team_site_url: "https://asugrizzlies.com",
    roster_url: "https://asugrizzlies.com/sports/baseball/roster",
    schedule_url: null,
    schedule_alt_url: null,
    calendar_feed_url:
      "https://asugrizzlies.com/calendar.ashx/calendar.rss?sport_id=1&_=cmn39vwio00053b9re3tz8w8f",
  },
  {
    teamid: "20021",
    source_system: "wmt",
    team_site_url: "https://thesundevils.com",
    roster_url: "https://thesundevils.com/sports/baseball/roster",
    schedule_url: "https://thesundevils.com/sports/baseball/schedule?view=list",
    schedule_alt_url: null,
    calendar_feed_url: "https://calendar.wmt.digital/calendar/thesundevils",
  },
  {
    teamid: "20026",
    source_system: "sidearm",
    team_site_url: "https://arizonawildcats.com",
    roster_url: "https://arizonawildcats.com/sports/baseball/roster?view=2",
    schedule_url: "https://arizonawildcats.com/sports/baseball/schedule/2026",
    schedule_alt_url:
      "https://arizonawildcats.com/services/download_file.ashx?file_location=https://s3.us-east-2.amazonaws.com/sidearm.nextgen.sites/arizona.sidearmsports.com/documents/2026/2/11/2026_Schedule.pdf",
    calendar_feed_url: null,
  },
];

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const opts: Options = {
    dryRun: false,
    runDiscovery: true,
    runIngest: true,
    runMatch: true,
    seedProofSet: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") opts.dryRun = true;
    if (arg === "--teamid" && args[i + 1]) {
      opts.teamId = args[i + 1];
      i += 1;
    }
    if (arg === "--no-discovery") opts.runDiscovery = false;
    if (arg === "--discovery-only") {
      opts.runDiscovery = true;
      opts.runIngest = false;
      opts.runMatch = false;
    }
    if (arg === "--ingest-only") {
      opts.runDiscovery = false;
      opts.runIngest = true;
      opts.runMatch = false;
    }
    if (arg === "--match-only") {
      opts.runDiscovery = false;
      opts.runIngest = false;
      opts.runMatch = true;
    }
    if (arg === "--seed-proof-set") opts.seedProofSet = true;
  }

  return opts;
}

async function seedProofSet(client: Client, dryRun: boolean, teamId?: string) {
  const filtered = teamId
    ? PROOF_SCHOOLS.filter((s) => s.teamid === teamId)
    : PROOF_SCHOOLS;

  if (filtered.length === 0) {
    console.log(`No proof schools matched teamid=${teamId}`);
    return;
  }

  for (const school of filtered) {
    if (dryRun) {
      console.log(
        JSON.stringify({ action: "seed-proof-set", mode: "dry-run", ...school }, null, 2)
      );
      continue;
    }

    await client.query(
      `
      update college_team_sources
      set
        source_system = coalesce($2, source_system),
        team_site_url = coalesce($3, team_site_url),
        roster_url = coalesce($4, roster_url),
        schedule_url = coalesce($5, schedule_url),
        schedule_alt_url = coalesce($6, schedule_alt_url),
        calendar_feed_url = coalesce($7, calendar_feed_url),
        ingest_enabled = true,
        updated_at = now()
      where teamid = $1
      `,
      [
        school.teamid,
        school.source_system,
        school.team_site_url,
        school.roster_url,
        school.schedule_url,
        school.schedule_alt_url,
        school.calendar_feed_url,
      ]
    );

    console.log(`Seeded proof school ${school.teamid}`);
  }
}

async function main() {
  const opts = parseArgs();

  if (opts.seedProofSet) {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await seedProofSet(client, opts.dryRun, opts.teamId);
    await client.end();
  }

  if (opts.runDiscovery) {
    await runDiscovery({ dryRun: opts.dryRun, teamId: opts.teamId });
  }

  if (opts.runIngest) {
    await runIngestCollegeRosters({ dryRun: opts.dryRun, teamId: opts.teamId });
  }

  if (opts.runMatch) {
    await runMatchCollegeRosterPlayers({ dryRun: opts.dryRun, teamId: opts.teamId });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
