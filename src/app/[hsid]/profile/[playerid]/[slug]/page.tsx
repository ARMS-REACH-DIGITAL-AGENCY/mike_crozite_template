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

  const matches = await findPlayersBySlug(slug, hsid);
  const player = matches?.find(p => String(p.playerid) === playerid);

  return (
    <div style={{ padding: '20px' }}>
      {!player ? (
        <h1>Player not found</h1>
      ) : (
        <>
          <h1>{player.firstname} {player.lastname}</h1>
          <p>Player ID: {player.playerid}</p>
          <p>HSID: {hsid}</p>
        </>
      )}
    </div>
  );
}
