import { getPlayerGameLogs, getTeamSchedule, getFlipCardTransactionStatus, getMlbTeamLogoMap } from '@/lib/db';

type GameLogRow = {
  game_date?: string | null;
  team_name?: string | null;
  opponent_name?: string | null;
  home_away?: string | null;
  line_summary?: string | null;
};

type ScheduleRow = {
  game_date?: string | null;
  opponent?: string | null;
  is_home?: boolean | null;
  status?: string | null;
  result?: string | null;
};

type DayEntry = {
  iso: string;
  dateLabel: string;
  headline: string;
  detail: string;
  isOffDay: boolean;
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDate(d);
}

function formatDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function firstNameOf(displayName: string) {
  return String(displayName || 'Player').trim().split(/\s+/)[0] || 'Player';
}

function matchupLabel(opponent: string | null | undefined, isHome: boolean | null | undefined) {
  const name = String(opponent || '').trim();
  if (!name) return 'Game';
  return isHome === false ? `@ ${name}` : `vs. ${name}`;
}

async function getSevenDayWindow(playerId: string): Promise<DayEntry[]> {
  const today = isoDate(new Date());

  const [transactionStatus, gameLogs, mlbTeamLogoMap] = await Promise.all([
    getFlipCardTransactionStatus(playerId),
    getPlayerGameLogs(playerId),
    getMlbTeamLogoMap(),
  ]);

  // current_team_source_team_id is the raw MLB Stats API team id (e.g. 147
  // for the Yankees); v_team_schedule_feed is keyed by tbc_teamid (Yankees
  // there is 20) - same crosswalk used for opponent logos translates it.
  const rawMlbTeamId = String((transactionStatus as any)?.current_team_source_team_id || '').trim();
  const teamId = rawMlbTeamId ? mlbTeamLogoMap.get(rawMlbTeamId) || '' : '';

  const schedule = teamId ? await getTeamSchedule(teamId) : [];
  const hasSchedule = Boolean(teamId) && (schedule as ScheduleRow[]).length > 0;

  const gameLogByDate = new Map<string, GameLogRow[]>();
  for (const row of gameLogs as GameLogRow[]) {
    const d = row.game_date ? String(row.game_date).slice(0, 10) : null;
    if (!d) continue;
    const bucket = gameLogByDate.get(d) ?? [];
    bucket.push(row);
    gameLogByDate.set(d, bucket);
  }

  const scheduleByDate = new Map<string, ScheduleRow>();
  for (const row of schedule as ScheduleRow[]) {
    const d = row.game_date ? String(row.game_date).slice(0, 10) : null;
    if (d) scheduleByDate.set(d, row);
  }

  const days: DayEntry[] = [];

  for (let offset = -3; offset <= 3; offset++) {
    const iso = addDays(today, offset);
    const dateLabel = formatDate(iso);
    const logRows = gameLogByDate.get(iso);
    const scheduleRow = scheduleByDate.get(iso);

    if (logRows && logRows.length > 0) {
      // A two-way player can have both a batting and a pitching row for the
      // same date - show both lines rather than picking one.
      const opponent = logRows[0].opponent_name;
      const isHome = logRows[0].home_away === 'home';
      days.push({
        iso,
        dateLabel,
        headline: matchupLabel(opponent, isHome),
        detail: logRows.map((r) => r.line_summary || 'Game result logged').join(' | '),
        isOffDay: false,
      });
      continue;
    }

    if (scheduleRow) {
      const isFuture = offset > 0;
      days.push({
        iso,
        dateLabel,
        headline: matchupLabel(scheduleRow.opponent, scheduleRow.is_home),
        detail: isFuture
          ? 'Upcoming'
          : scheduleRow.result || (scheduleRow.status ? scheduleRow.status : 'Result pending'),
        isOffDay: false,
      });
      continue;
    }

    if (hasSchedule) {
      // We have this team's schedule and there's genuinely no game on this
      // date - a real off day, not a data gap.
      days.push({ iso, dateLabel, headline: 'OFF DAY', detail: '', isOffDay: true });
      continue;
    }

    // No schedule data at all for this player's team - we can't tell an off
    // day from a data gap, so say so rather than guessing.
    days.push({ iso, dateLabel, headline: '--', detail: '', isOffDay: false });
  }

  return days;
}

export default async function PlayerSevenDaySnapshot({
  playerId,
  displayName,
  profileHref,
}: {
  playerId: string;
  displayName: string;
  profileHref: string;
}) {
  if (!playerId) return null;

  const days = await getSevenDayWindow(playerId);
  const hasAnyRealData = days.some((d) => d.isOffDay || d.headline !== '--');
  if (!hasAnyRealData) return null;

  const firstName = firstNameOf(displayName);
  const results = days.slice(0, 4); // 3 days back through today
  const upcoming = days.slice(4); // next 3 days

  return (
    <section className="yat-snapshot" aria-label={`${displayName} seven day snapshot`}>
      <a className="yat-snapshot-cta" href={profileHref}>
        <span className="yat-snapshot-icon" aria-hidden="true" />
        <span>See {firstName}&apos;s full season schedule &amp; game log on his profile page.</span>
      </a>

      <a className="yat-snapshot-polaroid" href={profileHref}>
        <div className="yat-snapshot-paper">
          <h3>7-Day Snapshot</h3>

          <div className="yat-snapshot-lines">
            {results.map((day) => (
              <div className="yat-snapshot-line" key={day.iso}>
                <strong>{day.dateLabel} {day.isOffDay ? 'OFF DAY' : day.headline}</strong>
                {!day.isOffDay && <span>{day.detail}</span>}
              </div>
            ))}
          </div>

          <div className="yat-snapshot-upcoming">
            {upcoming.map((day) => (
              <div key={day.iso}>
                <strong>{day.dateLabel}</strong>
                <span>{day.isOffDay ? 'OFF DAY' : `${day.headline}${day.detail ? ` - ${day.detail}` : ''}`}</span>
              </div>
            ))}
          </div>

          <div className="yat-snapshot-signature">{displayName}</div>
        </div>
      </a>

      <style>{`
        .yat-snapshot{ flex:0 0 auto; position:relative; z-index:4; padding:clamp(6px,2.2cqi,12px) clamp(6px,2.5cqi,14px); background:linear-gradient(180deg,rgba(205,198,187,.96),rgba(183,176,165,.94)); border-top:1px solid rgba(45,35,24,.22); border-bottom:1px solid rgba(45,35,24,.24); color:#17120c; }
        .yat-snapshot-cta{ display:flex; align-items:center; gap:clamp(5px,1.8cqi,9px); min-height:clamp(20px,7cqi,34px); margin:0 auto clamp(6px,2cqi,11px); padding:clamp(3px,1.5cqi,7px) clamp(6px,2.3cqi,12px); border:1px solid rgba(40,31,22,.24); border-radius:999px; background:rgba(255,255,255,.82); box-shadow:0 1px 0 rgba(255,255,255,.85), 0 2px 7px rgba(0,0,0,.16); color:#15100a; text-decoration:none; font:900 clamp(6px,2.3cqi,11px)/1.15 Oswald,sans-serif; letter-spacing:.04em; text-transform:uppercase; }
        .yat-snapshot-icon{ width:clamp(16px,5.8cqi,28px); height:clamp(18px,6.8cqi,32px); flex:0 0 auto; background:url('https://yatstats-assets.s3.us-west-2.amazonaws.com/players/then/${playerId}.jpg') center/cover no-repeat; border-radius:2px; box-shadow:0 1px 4px rgba(0,0,0,.24); }
        .yat-snapshot-polaroid{ display:block; text-decoration:none; color:inherit; }
        .yat-snapshot-paper{ width:min(82%,320px); margin:0 auto; padding:clamp(8px,3cqi,16px) clamp(9px,3.4cqi,18px) clamp(17px,7cqi,38px); transform:rotate(-1.4deg); background:linear-gradient(180deg,#fff 0%,#f6f4ee 58%,#ebe7dc 100%); border:1px solid rgba(0,0,0,.10); box-shadow:0 7px 16px rgba(0,0,0,.28), inset 0 0 24px rgba(101,84,61,.12); position:relative; overflow:hidden; }
        .yat-snapshot-paper::before{ content:''; position:absolute; inset:0; pointer-events:none; background:radial-gradient(circle at 20% 5%,rgba(255,255,255,.92),rgba(255,255,255,0) 28%), repeating-linear-gradient(172deg,rgba(0,0,0,.025) 0 1px,transparent 1px 5px); mix-blend-mode:multiply; opacity:.6; }
        .yat-snapshot-paper h3{ position:relative; z-index:1; margin:0 0 clamp(7px,2.6cqi,13px); font:900 clamp(9px,3.5cqi,18px)/1 Oswald,sans-serif; letter-spacing:.02em; text-transform:none; color:#17120c; }
        .yat-snapshot-lines{ position:relative; z-index:1; display:flex; flex-direction:column; gap:clamp(6px,2.2cqi,12px); }
        .yat-snapshot-line{ display:grid; gap:clamp(1px,.7cqi,3px); font-family:Oswald,sans-serif; color:#15110c; }
        .yat-snapshot-line strong{ font:900 clamp(8px,3.1cqi,15px)/1.1 Oswald,sans-serif; letter-spacing:.01em; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .yat-snapshot-line span{ font:800 clamp(7px,2.8cqi,14px)/1.1 Oswald,sans-serif; color:#312820; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .yat-snapshot-upcoming{ position:relative; z-index:1; margin-top:clamp(7px,2.6cqi,13px); display:grid; gap:clamp(4px,1.4cqi,8px); border-top:1px solid rgba(30,24,18,.16); padding-top:clamp(5px,1.9cqi,10px); }
        .yat-snapshot-upcoming div{ display:flex; align-items:baseline; gap:clamp(5px,1.8cqi,9px); color:#5a5148; font:800 clamp(6px,2.2cqi,10px)/1.1 Oswald,sans-serif; text-transform:uppercase; letter-spacing:.04em; }
        .yat-snapshot-upcoming strong{ color:#1f1710; }
        .yat-snapshot-signature{ position:relative; z-index:1; margin-top:clamp(7px,2.8cqi,15px); transform:rotate(-3deg); font:400 clamp(14px,6.8cqi,36px)/.9 'Brush Script MT','Segoe Script',cursive; color:#16120e; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      `}</style>
    </section>
  );
}
