import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { hsid: string } }
) {
  const hsid = params.hsid;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return NextResponse.json(
      { error: "DATABASE_URL is missing in Vercel environment variables." },
      { status: 500 }
    );
  }

  const pool = new Pool({ connectionString });

  try {
    // This does NOT change your database.
    // It only asks the database: "what columns exist in these tables?"
    const cols = await pool.query(
      `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('tbc_players_raw', 'tbc_schools_raw')
      order by table_name, ordinal_position;
      `
    );

    return NextResponse.json({
  stamp: "ST-5004-TEST-1",
  hsid,
});
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  } finally {
    await pool.end();
  }
}
