import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export type PlayerPhotoRow = {
  playerid: number;
  image_role: string;
  image_url: string | null;
  s3_key: string | null;
  approval_status: string;
  is_primary: boolean;
  is_active: boolean;
  show_on_pp_timeline: boolean;
  season_year: string | null;
  image_year: string | null;
  date_taken: string | null;
  created_at: string;
};

export async function getPlayerPhotoByRole(
  playerid: number | string,
  imageRole: string
): Promise<PlayerPhotoRow | null> {
  const result = await pool.query<PlayerPhotoRow>(
    `
    select
      playerid,
      image_role,
      image_url,
      s3_key,
      approval_status,
      is_primary,
      is_active,
      show_on_pp_timeline,
      season_year,
      image_year,
      date_taken,
      created_at
    from public.player_photos
    where playerid = $1
      and image_role = $2
      and approval_status = 'APPROVED'
      and is_active = true
    order by
      is_primary desc,
      date_taken desc nulls last,
      created_at desc
    limit 1
    `,
    [playerid, imageRole]
  );

  return result.rows[0] ?? null;
}
