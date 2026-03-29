import { findPlayersBySlug } from "@/lib/db";

type Props = {
  params: {
    hsid: string;
    playerid: string;
    slug: string;
  };
};

export default async function ProfilePage({ params }: Props) {
  const { hsid, playerid, slug } = params;

  let player = null;

  try {
    const matches = await findPlayersBySlug(slug, hsid);
    player = matches?.find(p => String(p.playerid) === playerid);
  } catch (e) {
    console.error("DB ERROR:", e);
  }

  return (
    <div style={{ padding: '20px' }}>
      {!player ? (
        <h1>No player</h1>
      ) : (
        <>
          <h1>{player.firstname} {player.lastname}</h1>
          <p>{player.playerid}</p>
        </>
      )}
    </div>
  );
}

