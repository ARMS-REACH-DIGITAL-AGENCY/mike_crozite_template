import SafeImage from "@/components/SafeImage";
import { getPlayerGameLogs, getTeamSchedule, getFlipCardTransactionStatus, getMlbTeamLogoMap } from '@/lib/db';
import { toISODate } from '@/lib/playerUtils';

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";
const YATCREST_URL = `${S3_BASE}/assets/YatCrest.png`;

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
    const d = toISODate(row.game_date);
    if (!d) continue;
    const bucket = gameLogByDate.get(d) ?? [];
    bucket.push(row);
    gameLogByDate.set(d, bucket);
  }

  const scheduleByDate = new Map<string, ScheduleRow>();
  for (const row of schedule as ScheduleRow[]) {
    const d = toISODate(row.game_date);
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

/**
 * Lives inside FunZone's GAME LOG tab panel (passed in as a prop from
 * PlayerCardBack, since this is an async Server Component and FunZone is a
 * Client Component) - not a standalone section above the tab strip, and not
 * its own CTA (FunZone's YatiCta strip already says "See X's full season
 * schedule & game log..." for this tab). Typography matches the rest of
 * FunZone: Bebas Neue for headlines, Oswald for labels/body - no script font.
 */
export default async function PlayerSevenDaySnapshot({
  playerId,
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

  const results = days.slice(0, 4); // 3 days back through today
  const upcoming = days.slice(4); // next 3 days
  const photoSrc = `${S3_BASE}/players/now/${playerId}.jpg`;

  return (
    <a className="yat-snap" href={profileHref} aria-label="7-Day Snapshot - full season schedule and game log">
      <div className="yat-snap-photo">
        <SafeImage src={photoSrc} alt="" className="yat-snap-photo-img" placeholderSrc={YATCREST_URL} />
      </div>

      <div className="yat-snap-frame">
        <div className="yat-snap-title">7-DAY SNAPSHOT</div>

        <div className="yat-snap-rows">
          {results.map((day) => (
            <div className="yat-snap-row" key={day.iso}>
              <span className="yat-snap-date">{day.dateLabel}</span>
              <span className="yat-snap-matchup">{day.isOffDay ? 'OFF DAY' : day.headline}</span>
              {!day.isOffDay && <span className="yat-snap-line">{day.detail}</span>}
            </div>
          ))}
        </div>

        <div className="yat-snap-divider" />

        <div className="yat-snap-rows yat-snap-rows-upcoming">
          {upcoming.map((day) => (
            <div className="yat-snap-row" key={day.iso}>
              <span className="yat-snap-date">{day.dateLabel}</span>
              <span className="yat-snap-matchup">
                {day.isOffDay ? 'OFF DAY' : `${day.headline}${day.detail ? ` – ${day.detail}` : ''}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .yat-snap{
          display:flex;
          flex-direction:column;
          height:100%;
          min-height:0;
          text-decoration:none;
          color:inherit;
          border:1px solid rgba(30,22,14,0.18);
          border-radius:clamp(4px,1.2cqi,7px);
          overflow:hidden;
          background:#fff;
        }
        .yat-snap-photo{
          position:relative;
          width:100%;
          flex-shrink:0;
          /* Closer to square (real Polaroids are square photos) and tall
             enough to actually show a face instead of just a cap brim. */
          aspect-ratio:4/3;
          background:#c2b9ae;
          overflow:hidden;
        }
        .yat-snap-photo-img{
          position:absolute;
          inset:0;
          width:100%;
          height:100%;
          object-fit:cover;
          object-position:center 22%;
          display:block;
        }
        .yat-snap-frame{
          flex:1;
          min-height:0;
          overflow:hidden;
          padding:clamp(5px,1.8cqi,10px) clamp(6px,2cqi,11px);
          display:flex;
          flex-direction:column;
          gap:clamp(3px,1.2cqi,7px);
        }
        .yat-snap-title{
          font:700 clamp(7px,2.4cqi,11px)/1 "Bebas Neue",sans-serif;
          letter-spacing:.08em;
          color:rgba(30,22,14,0.55);
        }
        .yat-snap-rows{
          display:flex;
          flex-direction:column;
          gap:clamp(2px,.9cqi,5px);
          min-height:0;
        }
        .yat-snap-row{
          display:flex;
          align-items:baseline;
          gap:clamp(4px,1.4cqi,8px);
          min-width:0;
        }
        .yat-snap-date{
          flex:0 0 auto;
          font:700 clamp(8px,2.8cqi,13px)/1 "Bebas Neue",sans-serif;
          letter-spacing:.02em;
          color:#17120c;
          min-width:2.4em;
        }
        .yat-snap-matchup{
          flex:0 1 auto;
          min-width:0;
          font:600 clamp(6.5px,2.2cqi,9.5px)/1.2 Oswald,sans-serif;
          letter-spacing:.02em;
          text-transform:uppercase;
          color:#3a2f24;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .yat-snap-line{
          flex:1 1 auto;
          min-width:0;
          font:400 clamp(6.5px,2.2cqi,9.5px)/1.2 Oswald,sans-serif;
          color:#6b5d4d;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          text-align:right;
        }
        .yat-snap-divider{
          height:1px;
          background:rgba(30,22,14,0.14);
          margin:clamp(1px,.6cqi,3px) 0;
        }
        .yat-snap-rows-upcoming .yat-snap-matchup{ color:#6b5d4d; }
      `}</style>
    </a>
  );
}
