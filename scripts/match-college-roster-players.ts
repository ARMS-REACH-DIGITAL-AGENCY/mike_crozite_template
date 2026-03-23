import { Client } from "pg";

type MatchOptions = {
  dryRun?: boolean;
  teamId?: string;
};

function parseArgs(): MatchOptions {
  const args = process.argv.slice(2);
  const opts: MatchOptions = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") opts.dryRun = true;
    if (arg === "--teamid" && args[i + 1]) {
      opts.teamId = args[i + 1];
      i += 1;
    }
  }
  return opts;
}

export async function runMatchCollegeRosterPlayers(options: MatchOptions = {}) {
  const { dryRun = false, teamId } = options;

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const values: string[] = [];
  let where = "where 1=1";
  if (teamId) {
    values.push(teamId);
    where += ` and teamid = $${values.length}`;
  }

  const { rows } = await client.query<{ teamid: string; total: string }>(
    `
      select teamid, count(*)::text as total
      from college_roster_players_raw
      ${where}
      group by teamid
      order by teamid
    `,
    values
  );

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "live",
        matchedTeams: rows.length,
        counts: rows,
      },
      null,
      2
    )
  );

  await client.end();
}

if (require.main === module) {
  runMatchCollegeRosterPlayers(parseArgs()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
