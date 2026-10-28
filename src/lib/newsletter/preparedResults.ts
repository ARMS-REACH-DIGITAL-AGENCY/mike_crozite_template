import 'server-only';
import { query } from '@/lib/tribune/db';

export type PublicationCadence = 'daily' | 'weekly';
export type PreparedPeriod = {
 cadence: PublicationCadence; period_start: string; period_end: string; season_key: string;
 week: number; cutoff_at: string; ready_at: string; row_counts: Record<string, number>;
};
export type PreparedRecipient = {
 firebase_uid: string; email: string; first_name: string | null; home_hsid: string;
 home_school_name: string | null; plan: string; is_superfan: boolean;
};
export type PreparedEdition = {
 period: PreparedPeriod; recipient: PreparedRecipient;
 favorites: Array<{ playerid: string }>;
 playerLines: Record<string, unknown>[];
 schoolStories: Record<string, unknown>[];
 gameScores: Record<string, unknown>[];
 scoreBoardPicks: Record<string, unknown>[];
 homeBoxScores: Record<string, unknown>[];
};

/** Read-only; unlike the obsolete Tribune tournament adapter this never calls scoring APIs. */
export async function loadPreparedEdition(input: {
 email: string; cadence: PublicationCadence; start: string; end: string; season: string;
}): Promise<PreparedEdition> {
 const { email, cadence, start, end, season } = input;
 if (!['daily','weekly'].includes(cadence) ||
   !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
   start > end || !season || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
   throw new Error('Invalid prepared publication identity');
 }
 const period = (await query<PreparedPeriod>(
   `SELECT cadence,period_start::text,period_end::text,season_key,week,
      cutoff_at::text,ready_at::text,row_counts
    FROM public.edition_ready
    WHERE cadence=$1 AND period_start=$2::date AND period_end=$3::date AND season_key=$4`,
   [cadence,start,end,season],
 )).rows[0];
 if (!period) throw new Error('Publication not ready');
 const who = (await query<PreparedRecipient>(
   `SELECT firebase_uid,email,first_name,home_hsid,home_school_name,plan,is_superfan
    FROM public.newsletter_recipients WHERE email=lower(btrim($1))`,[email],
 )).rows;
 if (who.length !== 1 || !who[0].home_hsid) throw new Error('Recipient identity unavailable');
 const recipient=who[0];
 const favorites = (await query<{playerid:string}>(
   'SELECT playerid FROM public.newsletter_favorites WHERE firebase_uid=$1 ORDER BY playerid',
   [recipient.firebase_uid])).rows;
 const school=Number(recipient.home_hsid);
 if (!Number.isSafeInteger(school)) throw new Error('Recipient school identity invalid');
 const [playerLines,schoolStories,gameScores,scoreBoardPicks,homeBoxScores]=await Promise.all([
   cadence==='daily'
    ? query(`SELECT d.* FROM public.daily_stat_lines d JOIN public.newsletter_favorites f
        ON f.playerid=d.playerid AND f.firebase_uid=$2
        WHERE d.stats_date=$1::date ORDER BY d.sort_key,d.playerid,d.stat_line_id`,[start,recipient.firebase_uid])
    : query(`SELECT * FROM public.weekly_player_lines WHERE season_key=$1 AND period_start=$2::date
        AND period_end=$3::date AND hsid=$4 ORDER BY sort_key,playerid`,[season,start,end,school]),
   cadence==='daily'
    ? query(`SELECT * FROM public.daily_game_stories WHERE stats_date=$1::date AND season_key=$2 AND hsid=$3
        ORDER BY game_id`,[start,season,school])
    : Promise.resolve({rows:[]}),
   cadence==='daily'
    ? query(`SELECT DISTINCT s.* FROM public.daily_game_scores s
        LEFT JOIN public.user_scoreboard_schools p ON p.firebase_uid=$3 AND
             (s.home_hsid=p.hsid OR s.away_hsid=p.hsid)
        WHERE s.stats_date=$1::date AND s.season_key=$2
          AND (s.home_hsid=$4 OR s.away_hsid=$4 OR p.hsid IS NOT NULL)
        ORDER BY s.game_id LIMIT 12`,[start,season,recipient.firebase_uid,school])
    : Promise.resolve({rows:[]}),
   query('SELECT position,hsid,label FROM public.user_scoreboard_schools WHERE firebase_uid=$1 ORDER BY position',
      [recipient.firebase_uid]),
   cadence==='weekly'
    ? query(`SELECT * FROM public.weekly_box_scores WHERE season_key=$1
        AND period_start=$2::date AND period_end=$3::date
        AND (home_hsid=$4 OR away_hsid=$4) ORDER BY game_id`,[season,start,end,school])
    : Promise.resolve({rows:[]}),
 ]);
 return {
   period,recipient,favorites,
   playerLines:playerLines.rows,schoolStories:schoolStories.rows,
   gameScores:gameScores.rows,scoreBoardPicks:scoreBoardPicks.rows,
   homeBoxScores:homeBoxScores.rows,
 };
}
