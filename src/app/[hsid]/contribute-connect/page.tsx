import {
  getSchoolByHsid,
  getActiveRosterByHsid,
  getBatchDesignatedPlayerImages,
  getFlipCardFrontStageByHsid,
} from "@/lib/db";
import { getSchoolCrestUrl } from "@/lib/schoolAssets";
import { sortActivePlayers, isRetiredAtHighSchoolLevel } from "@/lib/playerUtils";
import PlayerCard from "@/components/yatstats/PlayerCard";
import ContributeInteractions from "./ContributeInteractions";

export async function generateMetadata({ params }: { params: Promise<{ hsid: string }> }) {
  return {
    title: "Connecting Contribute | YAT?STATS",
    description:
      "Share photos, news tips, and stories about your school's baseball alumni.",
  };
}

type Row = Record<string, unknown>;
const asRows = (r: unknown): Row[] => (Array.isArray(r) ? (r as Row[]) : []);

export default async function ContributeConnectPage({ params }: { params: Promise<{ hsid: string }> }) {
  const { hsid } = await params;
  const school = (await getSchoolByHsid(hsid).catch(() => null)) as Row | null;
  const resolvedHsid = String(school?.hsid ?? hsid);
  const schoolName = String(school?.hsname ?? "School");

  const [activeRosterResult, flipFrontStageResult] = await Promise.all([
    getActiveRosterByHsid(resolvedHsid).catch(() => []),
    getFlipCardFrontStageByHsid(resolvedHsid).catch(() => []),
  ]);

  const activeRosterRows = asRows(activeRosterResult);
  const stageRows = asRows(flipFrontStageResult).filter((p) => !isRetiredAtHighSchoolLevel(p));
  const stageMap = new Map(stageRows.map((p) => [String(p.playerid), p]));

  const activeMerged: Row[] = [];
  for (const p of activeRosterRows) {
    const id = String(p.playerid);
    const stageRow = stageMap.get(id);
    activeMerged.push(stageRow ? { ...stageRow, ...p } : { ...p });
  }
  const sorted = sortActivePlayers(activeMerged);
  const threePlayers = sorted.slice(0, 3);
  const playerIds = threePlayers.map((p) => String(p.playerid));
  const stripPlayers = sorted.slice(0, 12);
  const stripIds = stripPlayers.map((p) => String(p.playerid));

  const [frontImageMap, headshotMap, stripHeadshotMap] = await Promise.all([
    playerIds.length
      ? getBatchDesignatedPlayerImages(playerIds, "YATSTATS_FRONT").catch(() => new Map<string, any>())
      : Promise.resolve(new Map<string, any>()),
    playerIds.length
      ? getBatchDesignatedPlayerImages(playerIds, "HEADSHOT").catch(() => new Map<string, any>())
      : Promise.resolve(new Map<string, any>()),
    stripIds.length
      ? getBatchDesignatedPlayerImages(stripIds, "HEADSHOT").catch(() => new Map<string, any>())
      : Promise.resolve(new Map<string, any>()),
  ]);

  const crestUrl = getSchoolCrestUrl(resolvedHsid);
  const shareBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://yatstats.com";

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', paddingBottom: '40px' }}>
      {/* School header */}
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <img src={crestUrl} alt="School crest"
          data-upload-type="school_logo"
          style={{ width: '64px', height: '64px', cursor: 'pointer', objectFit: 'contain' }}
        />
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800 }}>{schoolName.toUpperCase()}</div>
          <div style={{ fontSize: '13px', color: '#aaa' }}>CONNECTING CONTRIBUTE</div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }} data-arrow="school_logo">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <span style={{ fontSize: '24px', color: '#FFD700' }}>➤</span>
          <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '.03em' }}>HIGH SCHOOL LOGO</span>
        </div>
      </div>

      {/* Row 3: Headshot strip */}
      <div style={{ display: 'flex', overflowX: 'auto', gap: '2px', padding: '8px 0' }}>
        {stripPlayers.map((p) => {
          const pid = String(p.playerid);
          const hs = stripHeadshotMap.get(pid)?.image_url;
          const name = String(p.last_name || p.player_name || '?').toUpperCase();
          return (
            <div key={pid} data-upload-type="headshot" style={{ flexShrink: 0, width: '110px', cursor: 'pointer' }}>
              <div style={{ width: '110px', height: '130px', background: '#1a1a1a', overflow: 'hidden' }}>
                {hs ? (
                  <img src={hs} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>👤</div>
                )}
              </div>
              <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, padding: '4px 0' }}>
                {name}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '0 16px', marginBottom: '16px' }} data-arrow="headshot">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <span style={{ fontSize: '24px', color: '#FFD700' }}>➤</span>
          <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '.03em' }}>CURRENT OFFICIAL HEADSHOT</span>
        </div>
      </div>

      {/* Polaroid CTA */}
      <div style={{ padding: '0 16px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div data-upload-type="flip_card"
          style={{
            width: '60px', height: '70px', background: '#fff', borderRadius: '4px',
            padding: '4px 4px 16px 4px', cursor: 'pointer', transform: 'rotate(-5deg)',
          }}>
          <div style={{ width: '100%', height: '100%', background: '#111' }} />
        </div>
        <div data-upload-type="flip_card" style={{ cursor: 'pointer' }}>
          <span style={{ fontSize: '20px', color: '#FFD700' }}>←</span>
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#FFD700', marginLeft: '8px' }}>
            START HERE TO UPLOAD
          </span>
        </div>
      </div>

      {/* Section 5: Real flip cards */}
      <div style={{ padding: '16px' }}>
        <div style={{ marginBottom: '12px' }}>
          <div data-arrow="flip_card" style={{ cursor: 'pointer', marginBottom: '4px' }}>
            <span style={{ fontSize: '24px', color: '#FFD700' }}>➤</span>
            <span style={{ fontSize: '15px', fontWeight: 800, marginLeft: '8px' }}>FLIP CARD FRONT</span>
            <span style={{ fontSize: '13px', color: '#aaa', marginLeft: '8px' }}>(High school image)</span>
          </div>
          <div data-arrow="back_hero" style={{ cursor: 'pointer' }}>
            <span style={{ fontSize: '24px', color: '#FFD700' }}>➤</span>
            <span style={{ fontSize: '15px', fontWeight: 800, marginLeft: '8px' }}>FLIP CARD BACK</span>
            <span style={{ fontSize: '13px', color: '#aaa', marginLeft: '8px' }}>(Current team hero image)</span>
          </div>
        </div>
        <div className="yat-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {players.map((p) => {
            const pid = String(p.playerid);
            return (
              <PlayerCard
                key={pid}
                player={p}
                resolvedHsid={resolvedHsid}
                frontImageUrl={frontImageMap.get(pid)?.image_url ?? null}
                headshotUrl={headshotMap.get(pid)?.image_url ?? null}
                shareBaseUrl={shareBaseUrl}
                schoolName={schoolName}
                schoolLocation=""
              />
            );
          })}
        </div>
        <p style={{ fontSize: '12px', color: '#888', marginTop: '12px' }}>
          <span style={{ color: '#FFD700' }}>➤</span>{' '}
          <strong style={{ color: '#fff' }}>News Tip:</strong> Your news tip appears on the
          back of the flip card in the Fun Zone tab.
        </p>
      </div>

      {/* Section 5.5: Player profile elements */}
      <div style={{ padding: '16px', borderTop: '1px solid #222' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#666', marginBottom: '12px' }}>
          PLAYER PROFILE PAGE
        </h2>
        <div data-arrow="timeline_hero" style={{ cursor: 'pointer', marginBottom: '8px' }}>
          <span style={{ fontSize: '24px', color: '#FFD700' }}>➤</span>
          <span style={{ fontSize: '15px', fontWeight: 800, marginLeft: '8px' }}>CAREER PATH TIMELINE ANNUAL HERO IMAGE</span>
          <span style={{ fontSize: '13px', color: '#aaa', marginLeft: '8px' }}>(College or Pro)</span>
        </div>
        <div data-upload-type="timeline_hero"
          style={{ background: '#111', borderRadius: '8px', padding: '16px', cursor: 'pointer', marginBottom: '16px' }}>
          <div style={{ height: '80px', background: '#1a1a1a', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '13px' }}>
            [Timeline hero — click to upload]
          </div>
        </div>
        <div data-arrow="team_logo" style={{ cursor: 'pointer', marginBottom: '8px' }}>
          <span style={{ fontSize: '24px', color: '#FFD700' }}>➤</span>
          <span style={{ fontSize: '15px', fontWeight: 800, marginLeft: '8px' }}>NEXT-LEVEL TEAM LOGO</span>
          <span style={{ fontSize: '13px', color: '#aaa', marginLeft: '8px' }}>(College or Pro)</span>
        </div>
        <div data-upload-type="team_logo"
          style={{ display: 'flex', gap: '12px', cursor: 'pointer', padding: '12px', background: '#111', borderRadius: '8px', width: 'fit-content' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ width: '48px', height: '48px', background: '#1a1a1a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🏟️</div>
          ))}
        </div>
      </div>

      {/* Section 6: Banner ad */}
      <div style={{ marginTop: '24px', borderTop: '1px solid #222', paddingTop: '16px' }}>
        <div style={{ padding: '0 16px', marginBottom: '8px' }}>
          <span style={{ fontSize: '24px', color: '#FFD700' }}>➤</span>
          <span style={{ fontSize: '15px', fontWeight: 800, marginLeft: '8px' }}>SPONSOR A PLAYER PAGE</span>
          <span style={{ fontSize: '13px', color: '#aaa', marginLeft: '8px' }}>(Your business here)</span>
        </div>
        <div style={{
          background: '#1a1a1a', padding: '24px 16px', textAlign: 'center',
          borderTop: '2px solid #FFD700', borderBottom: '2px solid #FFD700',
        }}>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#FFD700', marginBottom: '8px' }}>
            YOUR MESSAGE HERE
          </div>
          <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '12px' }}>
            Sponsor a player page — $10/mo. Your banner ad, your link.
          </div>
          <button style={{
            background: '#FFD700', color: '#000', fontWeight: 700,
            fontSize: '14px', padding: '10px 24px', borderRadius: '8px',
            border: 'none', cursor: 'pointer',
          }}>
            Become a Sponsor →
          </button>
        </div>
      </div>

      {/* Client interactions: upload drawers, login prompts */}
      <ContributeInteractions hsid={resolvedHsid} />
    </div>
  );
}
