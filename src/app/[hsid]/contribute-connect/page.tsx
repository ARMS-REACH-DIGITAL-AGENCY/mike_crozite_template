import ContributeExplainer from "@/components/ContributeExplainer";

export async function generateMetadata({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  return {
    title: "Connect & Contribute Portal | YAT?STATS",
    description:
      "Share photos, news tips, and stories about your school's baseball alumni. Upload high school images, headshots, timeline photos, and logos.",
  };
}

export default async function ContributeConnectPage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 20px 140px' }}>
      <ContributeExplainer defaultHsid={hsid} />
    </div>
  );
}
