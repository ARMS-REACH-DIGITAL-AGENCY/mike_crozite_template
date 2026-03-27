type Props = {
  params: {
    hsid: string;
    playerid: string;
    slug: string;
  };
};

export default async function ProfilePage({ params }: Props) {
  const { hsid, playerid, slug } = params;

  return (
    <div style={{ padding: '20px' }}>
      <h1>WORKING</h1>
      <p>{hsid}</p>
      <p>{playerid}</p>
      <p>{slug}</p>
    </div>
  );
}
