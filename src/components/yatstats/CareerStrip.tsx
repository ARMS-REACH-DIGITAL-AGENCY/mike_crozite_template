// src/components/yatstats/CareerStrip.tsx
// Golden Line card strip for player profile Row 3.
// Row 4 is the timeline navigation; Row 3 holds real memory cards plus subtle empty-card placeholders.
"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { SchoolContext } from "@/context/SchoolContext";
import { usePlayerProfile } from "@/context/PlayerProfileContext";

const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

type CareerMoment = {
  id: string;
  year: string;
  stage: string;
  title: string;
  caption: string;
  src?: string;
  href?: string;
  contributor?: string;
  relationship?: string;
  photoTakenDate?: string | null;
  isUploadPrompt?: boolean;
  isGhost?: boolean;
  uploaded?: boolean;
};

type SubmittedMoment = {
  id: string;
  stage: string;
  title?: string;
  caption?: string;
  contributor_name?: string;
  relationship?: string;
  image_url?: string;
  image_data_url?: string;
  photo_taken_date?: string | null;
  photo_taken_year?: number | null;
};

const GHOST_STAGES = ["Youth Baseball", "College", "Minor Leagues", "Major Leagues"];

function joinSchoolUrl(base: string, suffix = "") {
  const cleanBase = String(base || "").replace(/\/$/, "");
  return cleanBase ? `${cleanBase}${suffix}` : suffix || "/";
}

function flipCardHref(playerSchoolUrl: string | undefined, hsid: string, playerId: string) {
  if (!playerSchoolUrl && !hsid) return undefined;
  const base = playerSchoolUrl || `/${encodeURIComponent(hsid)}`;
  return joinSchoolUrl(base, `?view=active&player=${encodeURIComponent(playerId)}#player-${encodeURIComponent(playerId)}`);
}

function stageRank(stage: string) {
  const normalized = String(stage || "").toLowerCase();
  if (normalized.includes("youth")) return 10;
  if (normalized.includes("middle")) return 20;
  if (normalized.includes("high")) return 30;
  if (normalized.includes("college")) return 40;
  if (normalized.includes("minor")) return 50;
  if (normalized.includes("major") || normalized.includes("mlb")) return 60;
  return 70;
}

function yearLabel(value?: string | null, fallback = "Memory") {
  if (!value) return fallback;
  const raw = String(value);
  const parts = raw.slice(0, 10).split("-");
  if (parts.length >= 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
  return parts[0] || fallback;
}

function promptMoment(playerName: string): CareerMoment {
  const firstName = playerName.split(" ")[0] || "this player";
  return {
    id: "add-memory",
    year: "Add",
    stage: "Fan Memory",
    title: "Add a memory",
    caption: `Upload a youth, school, college, pro, family, or fan photo from ${firstName}'s baseball journey.`,
    isUploadPrompt: true,
  };
}

function archiveMoments(playerId: string, href?: string): CareerMoment[] {
  return [
    {
      id: "high-school",
      year: "High School",
      stage: "High School",
      title: "The hometown chapter",
      caption: "Games, teammates, coaches, dugout moments, and memories from people who were there.",
      src: `${S3_BASE}/players/then/${playerId}.jpg`,
      href,
      contributor: "YAT?STATS archive",
    },
    {
      id: "minors",
      year: "Minors",
      stage: "Minor Leagues",
      title: "The grind",
      caption: "Road trips, small parks, autographs, prospect moments, and the climb.",
      src: `${S3_BASE}/players/back/${playerId}.jpg`,
      contributor: "YAT?STATS archive",
    },
    {
      id: "majors",
      year: "MLB",
      stage: "Major Leagues",
      title: "The dream stage",
      caption: "Big-league debut, ballpark memories, signed items, or a fan moment you never forgot.",
      src: `${S3_BASE}/players/now/${playerId}.jpg`,
      contributor: "YAT?STATS archive",
    },
  ];
}

function ghostMoment(stage: string): CareerMoment {
  return {
    id: `ghost-${stage.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    year: "Open Slot",
    stage,
    title: "Memory spot available",
    caption: `Help fill this ${stage} chapter of the Golden Line.`,
    isGhost: true,
  };
}

function MomentImage({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);

  if (failed || !src) {
    return (
      <span className="gl-image-fallback" aria-hidden="true">
        <i className="ri-user-add-line" />
        <span>Open Slot</span>
      </span>
    );
  }

  return <img src={src} alt={title} onError={() => setFailed(true)} loading="lazy" />;
}

export default function CareerStrip({ playerId }: { playerId: string }) {
  const schoolData = useContext(SchoolContext);
  const playerProfile = usePlayerProfile();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [submittedMoments, setSubmittedMoments] = useState<SubmittedMoment[]>([]);
  const [activeMoment, setActiveMoment] = useState<CareerMoment | null>(null);

  const hsid = String(playerProfile?.playerHsid || schoolData?.hsid || "").trim();
  const playerName = String(playerProfile?.playerName || "this player").trim();
  const href = flipCardHref(playerProfile?.playerSchoolUrl, hsid, playerId);

  const moments = useMemo(() => {
    const uploads = submittedMoments.map((item): CareerMoment => ({
      id: `upload-${item.id}`,
      year: yearLabel(item.photo_taken_date, item.photo_taken_year ? String(item.photo_taken_year) : "Fan Upload"),
      stage: item.stage || "Fan Memory",
      title: item.title || `${item.stage || "Fan"} memory`,
      caption: item.caption || "A fan-submitted Golden Line memory is awaiting review.",
      src: item.image_url || item.image_data_url,
      contributor: item.contributor_name || "Fan submission",
      relationship: item.relationship || "",
      photoTakenDate: item.photo_taken_date,
      uploaded: true,
    }));

    const realMoments = [...archiveMoments(playerId, href), ...uploads].sort((a, b) => {
      const stageDiff = stageRank(a.stage) - stageRank(b.stage);
      if (stageDiff !== 0) return stageDiff;
      if (a.uploaded && b.uploaded) return String(a.photoTakenDate || "9999").localeCompare(String(b.photoTakenDate || "9999"));
      return Number(a.uploaded) - Number(b.uploaded);
    });

    const existingStages = new Set(realMoments.map((moment) => moment.stage));
    const ghostSlots = GHOST_STAGES.filter((stage) => !existingStages.has(stage)).map(ghostMoment);

    return [promptMoment(playerName), ...realMoments, ...ghostSlots].sort((a, b) => {
      if (a.isUploadPrompt) return -1;
      if (b.isUploadPrompt) return 1;
      const stageDiff = stageRank(a.stage) - stageRank(b.stage);
      if (stageDiff !== 0) return stageDiff;
      if (a.isGhost !== b.isGhost) return a.isGhost ? 1 : -1;
      return 0;
    });
  }, [playerId, playerName, href, submittedMoments]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`/api/player-moments?playerId=${encodeURIComponent(playerId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data?.moments) setSubmittedMoments(data.moments);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("yat:golden-line-uploaded", load);
    return () => {
      cancelled = true;
      window.removeEventListener("yat:golden-line-uploaded", load);
    };
  }, [playerId]);

  useEffect(() => {
    const onScrollStage = (event: Event) => {
      const stage = (event as CustomEvent).detail?.stage;
      if (!stage || !trackRef.current) return;
      const target = trackRef.current.querySelector<HTMLElement>(`[data-card-stage="${CSS.escape(stage)}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    };
    window.addEventListener("yat:golden-line-scroll-stage", onScrollStage);
    return () => window.removeEventListener("yat:golden-line-scroll-stage", onScrollStage);
  }, []);

  function openUpload(moment?: CareerMoment) {
    try {
      sessionStorage.setItem("yat:goldenLineStage", moment?.stage || "Fan Memory");
      window.dispatchEvent(new CustomEvent("yat:golden-line-stage"));
    } catch {}
    window.location.hash = "ppTab-upload";
  }

  return (
    <div className="gallery-strip golden-line-strip" id="playerCareerStrip">
      <div className="gl-header" aria-label="Golden Line career timeline">
        <div>
          <span className="gl-kicker">The Golden Line</span>
          <span className="gl-title">Career Path</span>
          <button className="gl-add" type="button" onClick={() => openUpload()}>+ Add Photo</button>
        </div>
      </div>

      <div className="gl-track-wrap" ref={trackRef}>
        <div className="gl-track" role="list" aria-label={`${playerName} career memories`}>
          {moments.map((moment, idx) => (
            <div className={`gl-slot gl-slot-${idx % 6} ${moment.isGhost ? "gl-slot-ghost" : ""}`} key={moment.id} role="listitem" data-card-stage={moment.stage}>
              <button type="button" className={`gl-card ${moment.isUploadPrompt ? "gl-card-prompt" : ""} ${moment.isGhost ? "gl-card-ghost" : ""}`} onClick={() => moment.isUploadPrompt || moment.isGhost ? openUpload(moment) : setActiveMoment(moment)} aria-label={`Open ${moment.title}`}>
                {moment.isGhost ? <span className="gl-ghost-stack" aria-hidden="true" /> : null}
                <span className="gl-photo"><MomentImage src={moment.src} title={moment.title} /></span>
                <span className="gl-copy">
                  <span className="gl-year">{moment.year}</span>
                  <span className="gl-stage">{moment.stage}</span>
                  <span className="gl-card-title">{moment.title}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {activeMoment && (
        <div className="gl-modal-backdrop" role="presentation" onClick={() => setActiveMoment(null)}>
          <section className="gl-modal" role="dialog" aria-modal="true" aria-label={activeMoment.title} onClick={(event) => event.stopPropagation()}>
            <button className="gl-close" type="button" onClick={() => setActiveMoment(null)} aria-label="Close">×</button>
            <div className="gl-modal-media"><MomentImage src={activeMoment.src} title={activeMoment.title} /></div>
            <div className="gl-modal-body">
              <div className="gl-modal-eyebrow">{activeMoment.year} · {activeMoment.stage}</div>
              <h2>{activeMoment.title}</h2>
              <p>{activeMoment.caption}</p>
              <div className="gl-modal-meta">
                <span>{activeMoment.contributor || "YAT?STATS archive"}</span>
                {activeMoment.relationship ? <span>{activeMoment.relationship}</span> : null}
                <span>{activeMoment.uploaded ? "Pending review" : "Archive moment"}</span>
              </div>
              <div className="gl-comment-box">
                <strong>Comments coming next</strong>
                <span>This is where fans will say “I remember this...” and add more context to the memory.</span>
              </div>
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .golden-line-strip { position: relative; height: 100%; min-height: 100px; overflow: hidden; isolation: isolate; background: linear-gradient(90deg, rgba(16,16,16,.98), rgba(8,8,8,.98)); border-top: 1px solid rgba(255,255,255,.08); }
        .gl-header { position: absolute; z-index: 3; left: 12px; top: 7px; color: #fff; text-transform: uppercase; pointer-events: none; }
        .gl-kicker, .gl-title { display: block; white-space: nowrap; }
        .gl-kicker { font: 800 9px/1 Oswald, sans-serif; letter-spacing: .15em; color: #f5c85a; }
        .gl-title { margin-top: 2px; font: 800 14px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .08em; }
        .gl-add { display: block; pointer-events: auto; margin-top: 5px; border: 1px solid rgba(245,200,90,.72); border-radius: 0; padding: 5px 8px 4px; background: rgba(0,0,0,.58); color: #f5c85a; font: 800 9px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
        .gl-track-wrap { height: 100%; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; padding-left: 142px; padding-right: 18px; }
        .gl-track-wrap::-webkit-scrollbar { display: none; }
        .gl-track { height: 100%; min-width: 860px; display: grid; grid-template-columns: repeat(8, 118px); align-items: end; gap: 10px; padding-bottom: 8px; }
        .gl-slot { transform: translateY(0) rotate(-1.2deg); }
        .gl-slot-1 { transform: translateY(-4px) rotate(1deg); } .gl-slot-2 { transform: translateY(0) rotate(-.6deg); } .gl-slot-3 { transform: translateY(-5px) rotate(.8deg); } .gl-slot-4 { transform: translateY(0) rotate(-.8deg); } .gl-slot-5 { transform: translateY(-4px) rotate(1deg); }
        .gl-slot-ghost { margin-left: -34px; opacity: .82; z-index: 0; }
        .gl-card { position: relative; display: grid; grid-template-columns: 56px minmax(0,1fr); align-items: stretch; width: 118px; height: 84px; padding: 4px; border: 1px solid rgba(255,255,255,.18); border-radius: 0; background: linear-gradient(135deg, rgba(29,29,29,.98), rgba(7,7,7,.92)); color: #fff; text-align: left; cursor: pointer; box-shadow: 0 8px 18px rgba(0,0,0,.34); transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .gl-card:hover, .gl-card:focus-visible { transform: translateY(-4px) scale(1.03); border-color: rgba(245,200,90,.94); box-shadow: 0 0 18px rgba(245,200,90,.22), 0 10px 24px rgba(0,0,0,.5); outline: none; }
        .gl-card-prompt { border-color: rgba(245,200,90,.72); background: linear-gradient(135deg, rgba(40,32,15,.98), rgba(10,10,10,.94)); }
        .gl-card-ghost { border-style: dashed; border-color: rgba(245,200,90,.36); background: linear-gradient(135deg, rgba(28,28,28,.72), rgba(5,5,5,.84)); }
        .gl-ghost-stack, .gl-ghost-stack::before { content:""; position:absolute; inset:5px; border:1px solid rgba(245,200,90,.26); background:rgba(255,255,255,.025); transform:translate(5px,-5px); z-index:-1; }
        .gl-ghost-stack::before { inset:3px; transform:translate(6px,-6px); }
        .gl-photo { display: block; width: 54px; height: 76px; overflow: hidden; border: 1px solid rgba(245,200,90,.5); border-radius: 0; background: #111; }
        .gl-photo img, .gl-modal-media img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top center; }
        .gl-image-fallback { width: 100%; height: 100%; display: grid; align-content: center; justify-items: center; gap: 4px; color: rgba(245,200,90,.78); background: linear-gradient(135deg, #252525, #0b0b0b); font-size: 18px; }
        .gl-image-fallback span { font: 800 7px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
        .gl-copy { min-width: 0; padding: 4px 1px 3px 6px; align-self: stretch; display: flex; flex-direction: column; }
        .gl-year, .gl-stage, .gl-card-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
        .gl-year { color: #f5c85a; font: 800 8px/1 Oswald, sans-serif; letter-spacing: .1em; }
        .gl-stage { margin-top: 4px; color: rgba(255,255,255,.92); font: 800 12px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .05em; }
        .gl-card-title { margin-top: auto; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: rgba(255,255,255,.68); font: 700 8px/1.05 Oswald, sans-serif; letter-spacing: .06em; }
        .gl-card-ghost .gl-copy, .gl-card-ghost .gl-photo { opacity: .64; }
        .gl-modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 18px; background: rgba(0,0,0,.78); backdrop-filter: blur(6px); }
        .gl-modal { position: relative; width: min(920px,96vw); max-height: min(720px,92vh); overflow: hidden; display: grid; grid-template-columns: minmax(260px,42%) minmax(0,1fr); border: 1px solid rgba(245,200,90,.48); border-radius: 0; background: linear-gradient(135deg, #191919, #070707); color: #f4f4f4; box-shadow: 0 24px 80px rgba(0,0,0,.72), 0 0 38px rgba(245,200,90,.18); }
        .gl-close { position: absolute; top: 10px; right: 12px; z-index: 2; width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.2); border-radius: 0; background: rgba(0,0,0,.58); color: #fff; font: 300 28px/1 Arial, sans-serif; cursor: pointer; }
        .gl-modal-media { min-height: 360px; background: #111; }
        .gl-modal-body { padding: 30px 28px 26px; overflow-y: auto; }
        .gl-modal-eyebrow { color: #f5c85a; font: 800 12px/1 Oswald, sans-serif; letter-spacing: .16em; text-transform: uppercase; }
        .gl-modal h2 { margin: 10px 0 12px; font: 800 clamp(28px,5vw,52px)/.92 "Bebas Neue", Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
        .gl-modal p { margin: 0; color: rgba(255,255,255,.82); font: 400 15px/1.5 system-ui, sans-serif; }
        .gl-modal-meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0; }
        .gl-modal-meta span { border: 1px solid rgba(255,255,255,.12); border-radius: 0; padding: 7px 10px; color: rgba(255,255,255,.78); background: rgba(255,255,255,.05); font: 700 11px/1 Oswald, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
        .gl-comment-box { display: grid; gap: 5px; padding: 14px; border-left: 3px solid #f5c85a; background: rgba(255,255,255,.06); }
        .gl-comment-box strong { font: 800 12px/1 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
        .gl-comment-box span { color: rgba(255,255,255,.72); font: 400 14px/1.35 system-ui, sans-serif; }
        @media (max-width: 760px) { .gl-header { left: 8px; } .gl-track-wrap { padding-left: 112px; } .gl-track { min-width: 760px; grid-template-columns: repeat(8, 108px); gap: 8px; } .gl-slot-ghost { margin-left: -30px; } .gl-card { width: 108px; height: 77px; grid-template-columns: 50px minmax(0,1fr); } .gl-photo { width: 48px; height: 69px; } .gl-modal { grid-template-columns: 1fr; overflow-y: auto; } .gl-modal-media { min-height: 230px; max-height: 38vh; } .gl-modal-body { padding: 24px 20px 22px; } }
      `}</style>
    </div>
  );
}
