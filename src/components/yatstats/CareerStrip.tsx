// src/components/yatstats/CareerStrip.tsx
// Interactive Golden Line career timeline strip (Block 3) on player profile pages.
// Version 2: square landscape baseball-card tiles, preset upload milestones,
// and a live fan-photo test uploader backed by /api/player-moments.
"use client";

import { ChangeEvent, FormEvent, useContext, useEffect, useMemo, useState } from "react";
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
  cta?: string;
  contributor?: string;
  reactionCount?: number;
  commentCount?: number;
  isUploadPrompt?: boolean;
  uploaded?: boolean;
};

type SubmittedMoment = {
  id: string;
  stage: string;
  title?: string;
  caption?: string;
  contributor_name?: string;
  relationship?: string;
  image_data_url?: string;
  status?: string;
};

const STAGE_OPTIONS = [
  "Youth Baseball",
  "Middle School",
  "High School",
  "College",
  "Minor Leagues",
  "Major Leagues",
  "Fan Memory",
];

function joinSchoolUrl(base: string, suffix = "") {
  const cleanBase = String(base || "").replace(/\/$/, "");
  return cleanBase ? `${cleanBase}${suffix}` : suffix || "/";
}

function flipCardHref(playerSchoolUrl: string | undefined, hsid: string, playerId: string) {
  if (!playerSchoolUrl && !hsid) return undefined;

  const base = playerSchoolUrl || `/${encodeURIComponent(hsid)}`;
  return joinSchoolUrl(
    base,
    `?view=active&player=${encodeURIComponent(playerId)}#player-${encodeURIComponent(playerId)}`
  );
}

function promptMoments(playerId: string, playerName: string, href?: string): CareerMoment[] {
  const firstName = playerName.split(" ")[0] || "this player";

  return [
    {
      id: "youth",
      year: "Before HS",
      stage: "Youth Baseball",
      title: "Before the lights",
      caption: `Have a Little League, travel ball, backyard, or early baseball photo of ${firstName}? Add it here.`,
      cta: "Upload youth photo",
      contributor: "Mom, dad, coach, teammate",
      reactionCount: 0,
      commentCount: 0,
      isUploadPrompt: true,
    },
    {
      id: "middle-school",
      year: "Middle",
      stage: "Middle School",
      title: "The in-between years",
      caption: "Help fill the gap between youth baseball and the varsity years.",
      cta: "Upload middle-school memory",
      contributor: "Family or friends",
      reactionCount: 0,
      commentCount: 0,
      isUploadPrompt: true,
    },
    {
      id: "high-school",
      year: "High School",
      stage: "High School",
      title: "The hometown chapter",
      caption: `The Hamilton years: games, teammates, coaches, dugout moments, and memories from people who were there.`,
      src: `${S3_BASE}/players/then/${playerId}.jpg`,
      href,
      cta: "Back to flip card",
      contributor: "YAT?STATS archive",
      reactionCount: 12,
      commentCount: 3,
    },
    {
      id: "college",
      year: "College",
      stage: "College",
      title: "Next-level chapter",
      caption: "Commitment day, campus visits, first college appearance, or photos with fans and family.",
      cta: "Upload college memory",
      contributor: "Fans, family, teammates",
      reactionCount: 0,
      commentCount: 0,
      isUploadPrompt: true,
    },
    {
      id: "minors",
      year: "Minors",
      stage: "Minor Leagues",
      title: "The grind",
      caption: `Road trips, small parks, autographs, prospect moments, and the people following ${firstName}'s climb.`,
      src: `${S3_BASE}/players/back/${playerId}.jpg`,
      cta: "Upload minor-league memory",
      contributor: "Community prompt",
      reactionCount: 7,
      commentCount: 0,
      isUploadPrompt: true,
    },
    {
      id: "majors",
      year: "MLB",
      stage: "Major Leagues",
      title: "The dream stage",
      caption: "Big-league debut, ballpark memories, signed items, or the fan moment you never forgot.",
      src: `${S3_BASE}/players/now/${playerId}.jpg`,
      cta: "Upload MLB memory",
      contributor: "YAT?STATS archive",
      reactionCount: 18,
      commentCount: 5,
      isUploadPrompt: true,
    },
  ];
}

function MomentImage({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => setFailed(!src), [src]);

  if (failed || !src) {
    return (
      <div className="gl-image-fallback" aria-hidden="true">
        <i className="ri-image-add-line" />
        <span>ADD PHOTO</span>
      </div>
    );
  }

  return <img src={src} alt={title} onError={() => setFailed(true)} loading="lazy" />;
}

function GoldenLinePath() {
  return (
    <svg className="gl-line" viewBox="0 0 1260 104" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id="goldenLineGlow" x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path className="gl-line-shadow" d="M0 84 L70 84 L112 20 L210 20 L252 84 L350 84 L392 20 L490 20 L532 84 L630 84 L672 20 L770 20 L812 84 L910 84 L952 20 L1050 20 L1092 84 L1260 84" />
      <path className="gl-line-main" d="M0 84 L70 84 L112 20 L210 20 L252 84 L350 84 L392 20 L490 20 L532 84 L630 84 L672 20 L770 20 L812 84 L910 84 L952 20 L1050 20 L1092 84 L1260 84" />
    </svg>
  );
}

export default function CareerStrip({ playerId }: { playerId: string }) {
  const schoolData = useContext(SchoolContext);
  const playerProfile = usePlayerProfile();
  const [activeMoment, setActiveMoment] = useState<CareerMoment | null>(null);
  const [submittedMoments, setSubmittedMoments] = useState<SubmittedMoment[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const hsid = String(playerProfile?.playerHsid || schoolData?.hsid || "").trim();
  const playerName = String(playerProfile?.playerName || "this player").trim();
  const href = flipCardHref(playerProfile?.playerSchoolUrl, hsid, playerId);

  const moments = useMemo(() => {
    const base = promptMoments(playerId, playerName, href);
    const uploads = submittedMoments.map((item): CareerMoment => ({
      id: `upload-${item.id}`,
      year: "Fan Upload",
      stage: item.stage || "Fan Memory",
      title: item.title || `${item.stage || "Fan"} memory`,
      caption: item.caption || "A fan-submitted Golden Line memory is awaiting review.",
      src: item.image_data_url,
      cta: "View submission",
      contributor: item.contributor_name || item.relationship || "Fan submission",
      reactionCount: 0,
      commentCount: 0,
      uploaded: true,
    }));
    return [...base, ...uploads];
  }, [playerId, playerName, href, submittedMoments]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/player-moments?playerId=${encodeURIComponent(playerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.moments) setSubmittedMoments(data.moments);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  function openUpload(moment?: CareerMoment) {
    setActiveMoment(moment || moments[0]);
    setUploadStatus("");
  }

  function handlePreview(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPreviewUrl("");
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("playerId", playerId);
    formData.set("hsid", hsid);
    if (activeMoment?.stage && !formData.get("stage")) formData.set("stage", activeMoment.stage);

    setIsUploading(true);
    setUploadStatus("Uploading memory...");

    try {
      const res = await fetch("/api/player-moments", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      setSubmittedMoments((prev) => [data.moment, ...prev]);
      setUploadStatus("Uploaded. It is marked pending so you can test the fan flow before full moderation is added.");
      form.reset();
      setPreviewUrl("");
    } catch (error: any) {
      setUploadStatus(error?.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="gallery-strip golden-line-strip" id="playerCareerStrip">
      <div className="gl-header" aria-label="Golden Line career timeline">
        <div>
          <span className="gl-kicker">The Golden Line</span>
          <span className="gl-title">Career Path</span>
        </div>
        <button className="gl-add" type="button" onClick={() => openUpload(moments[0])}>+ Add Photo</button>
      </div>

      <div className="gl-track-wrap">
        <GoldenLinePath />
        <div className="gl-track" role="list" aria-label={`${playerName} career memories`}>
          {moments.map((moment, idx) => (
            <div className={`gl-slot gl-slot-${idx % 6}`} key={moment.id} role="listitem">
              <button type="button" className={`gl-card ${moment.isUploadPrompt ? "gl-card-prompt" : ""}`} onClick={() => setActiveMoment(moment)} aria-label={`Open ${moment.title}`}>
                <span className="gl-dot" />
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

            <div className="gl-modal-media"><MomentImage src={previewUrl || activeMoment.src} title={activeMoment.title} /></div>

            <div className="gl-modal-body">
              <div className="gl-modal-eyebrow">{activeMoment.year} · {activeMoment.stage}</div>
              <h2>{activeMoment.title}</h2>
              <p>{activeMoment.caption}</p>

              <div className="gl-modal-meta">
                <span>By {activeMoment.contributor || "YAT?STATS"}</span>
                <span>{activeMoment.uploaded ? "Pending review" : "Milestone prompt"}</span>
                <span>{activeMoment.commentCount || 0} comments</span>
              </div>

              <form className="gl-upload-form" onSubmit={handleSubmit}>
                <strong>Add this memory to the Golden Line</strong>
                <label>
                  Photo stage
                  <select name="stage" defaultValue={activeMoment.stage || "Youth Baseball"}>
                    {STAGE_OPTIONS.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                  </select>
                </label>
                <label>
                  Your name
                  <input name="contributorName" placeholder="Mom, Dad, Coach, Teammate, Fan..." />
                </label>
                <label>
                  Relationship / role
                  <input name="relationship" placeholder="Parent, coach, teammate, alumni, fan..." />
                </label>
                <label>
                  Memory title
                  <input name="title" placeholder="Example: First travel ball tournament" defaultValue={activeMoment.isUploadPrompt ? "" : activeMoment.title} />
                </label>
                <label>
                  Caption / memory
                  <textarea name="caption" rows={3} placeholder="I remember this because..." />
                </label>
                <label>
                  Upload photo
                  <input name="photo" type="file" accept="image/*" required onChange={handlePreview} />
                </label>
                <div className="gl-modal-actions">
                  {activeMoment.href ? <a href={activeMoment.href}>Back to Flip Card</a> : null}
                  <button type="submit" disabled={isUploading}>{isUploading ? "Uploading..." : "Submit Memory"}</button>
                </div>
                {uploadStatus && <div className="gl-upload-status">{uploadStatus}</div>}
              </form>
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .golden-line-strip { position: relative; height: 100%; min-height: 100px; overflow: hidden; isolation: isolate; background: radial-gradient(circle at 20% 15%, rgba(255,196,72,.16), transparent 25%), linear-gradient(180deg, rgba(16,16,16,.96), rgba(6,6,6,.98)); border-top: 1px solid rgba(255,255,255,.08); border-bottom: 1px solid rgba(255,255,255,.08); }
        .golden-line-strip::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .2; background-image: linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 34px 34px; mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
        .gl-header { position: absolute; z-index: 3; left: 12px; top: 8px; display: flex; align-items: center; gap: 10px; color: #fff; text-transform: uppercase; pointer-events: none; }
        .gl-kicker, .gl-title { display: block; white-space: nowrap; }
        .gl-kicker { font: 800 10px/1 Oswald, sans-serif; letter-spacing: .16em; color: #f5c85a; text-shadow: 0 0 10px rgba(255,197,67,.55); }
        .gl-title { margin-top: 3px; font: 800 15px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .08em; }
        .gl-add { pointer-events: auto; border: 1px solid rgba(245,200,90,.72); border-radius: 0; padding: 6px 9px 5px; background: rgba(0,0,0,.58); color: #f5c85a; font: 800 9px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; box-shadow: 0 0 14px rgba(255,197,67,.16); }
        .gl-track-wrap { position: relative; height: 100%; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; padding-left: 138px; padding-right: 22px; }
        .gl-track-wrap::-webkit-scrollbar { display: none; }
        .gl-line { position: absolute; left: 108px; bottom: 0; width: max(1180px, calc(100% - 80px)); height: 98px; z-index: 0; pointer-events: none; }
        .gl-line-shadow, .gl-line-main { fill: none; stroke-linecap: square; stroke-linejoin: miter; }
        .gl-line-shadow { stroke: rgba(255,196,72,.22); stroke-width: 7; filter: url(#goldenLineGlow); }
        .gl-line-main { stroke: #f5c85a; stroke-width: 2.2; stroke-dasharray: 1680; stroke-dashoffset: 1680; animation: gl-draw 1.55s ease-out .18s forwards; filter: url(#goldenLineGlow); }
        .gl-track { position: relative; z-index: 2; height: 100%; min-width: 1180px; display: grid; grid-template-columns: repeat(7, 142px); align-items: center; gap: 16px; }
        .gl-slot { transform: translateY(-3px) rotate(-1.4deg); }
        .gl-slot-1 { transform: translateY(10px) rotate(1.2deg); } .gl-slot-2 { transform: translateY(-7px) rotate(-.8deg); } .gl-slot-3 { transform: translateY(11px) rotate(1deg); } .gl-slot-4 { transform: translateY(-6px) rotate(-1deg); } .gl-slot-5 { transform: translateY(9px) rotate(1.4deg); }
        .gl-card { position: relative; display: grid; grid-template-columns: 74px minmax(0,1fr); align-items: stretch; width: 140px; height: 100px; padding: 5px; border: 1px solid rgba(255,255,255,.18); border-radius: 0; background: linear-gradient(135deg, rgba(29,29,29,.98), rgba(7,7,7,.92)); color: #fff; text-align: left; cursor: pointer; box-shadow: 0 8px 22px rgba(0,0,0,.4); transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .gl-card:hover, .gl-card:focus-visible { transform: translateY(-5px) scale(1.03); border-color: rgba(245,200,90,.94); box-shadow: 0 0 20px rgba(245,200,90,.24), 0 10px 28px rgba(0,0,0,.55); outline: none; }
        .gl-card-prompt { border-style: dashed; }
        .gl-dot { position: absolute; left: 16px; bottom: -10px; width: 12px; height: 12px; border-radius: 0; background: #f5c85a; border: 2px solid #151515; box-shadow: 0 0 18px rgba(245,200,90,.8); }
        .gl-photo { display: block; width: 70px; height: 90px; overflow: hidden; border: 1px solid rgba(245,200,90,.5); border-radius: 0; background: #111; }
        .gl-photo img, .gl-modal-media img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top center; }
        .gl-image-fallback { width: 100%; height: 100%; display: grid; align-content: center; justify-items: center; gap: 4px; color: rgba(245,200,90,.88); background: radial-gradient(circle at center, rgba(245,200,90,.16), transparent 55%), linear-gradient(135deg, #272727, #0e0e0e); font-size: 22px; }
        .gl-image-fallback span { font: 800 8px/1 Oswald, sans-serif; letter-spacing: .1em; }
        .gl-copy { min-width: 0; padding: 5px 2px 4px 7px; align-self: stretch; display: flex; flex-direction: column; }
        .gl-year, .gl-stage, .gl-card-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
        .gl-year { color: #f5c85a; font: 800 9px/1 Oswald, sans-serif; letter-spacing: .12em; }
        .gl-stage { margin-top: 5px; color: rgba(255,255,255,.9); font: 800 14px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .05em; }
        .gl-card-title { margin-top: auto; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: rgba(255,255,255,.7); font: 700 9px/1.05 Oswald, sans-serif; letter-spacing: .06em; }
        .gl-modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 18px; background: rgba(0,0,0,.78); backdrop-filter: blur(6px); }
        .gl-modal { position: relative; width: min(920px,96vw); max-height: min(720px,92vh); overflow: hidden; display: grid; grid-template-columns: minmax(260px,42%) minmax(0,1fr); border: 1px solid rgba(245,200,90,.48); border-radius: 0; background: radial-gradient(circle at 0 0, rgba(245,200,90,.18), transparent 34%), linear-gradient(135deg, #191919, #070707); color: #f4f4f4; box-shadow: 0 24px 80px rgba(0,0,0,.72), 0 0 38px rgba(245,200,90,.18); }
        .gl-close { position: absolute; top: 10px; right: 12px; z-index: 2; width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.2); border-radius: 0; background: rgba(0,0,0,.58); color: #fff; font: 300 28px/1 Arial, sans-serif; cursor: pointer; }
        .gl-modal-media { min-height: 360px; background: #111; }
        .gl-modal-body { padding: 30px 28px 26px; overflow-y: auto; }
        .gl-modal-eyebrow { color: #f5c85a; font: 800 12px/1 Oswald, sans-serif; letter-spacing: .16em; text-transform: uppercase; }
        .gl-modal h2 { margin: 10px 0 12px; font: 800 clamp(28px,5vw,52px)/.92 "Bebas Neue", Oswald, sans-serif; letter-spacing: .04em; text-transform: uppercase; }
        .gl-modal p { margin: 0; color: rgba(255,255,255,.82); font: 400 15px/1.5 system-ui, sans-serif; }
        .gl-modal-meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0; }
        .gl-modal-meta span { border: 1px solid rgba(255,255,255,.12); border-radius: 0; padding: 7px 10px; color: rgba(255,255,255,.78); background: rgba(255,255,255,.05); font: 700 11px/1 Oswald, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
        .gl-upload-form { display: grid; gap: 10px; margin-top: 16px; padding: 14px; border-left: 3px solid #f5c85a; background: rgba(255,255,255,.06); }
        .gl-upload-form strong { font: 800 12px/1 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #fff; }
        .gl-upload-form label { display: grid; gap: 4px; color: rgba(255,255,255,.7); font: 700 10px/1 Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
        .gl-upload-form input, .gl-upload-form textarea, .gl-upload-form select { width: 100%; border: 1px solid rgba(255,255,255,.18); border-radius: 0; background: rgba(0,0,0,.45); color: #fff; padding: 8px; font: 400 13px/1.25 system-ui, sans-serif; }
        .gl-modal-actions { display: flex; flex-wrap: wrap; gap: 10px; }
        .gl-modal-actions a, .gl-modal-actions button { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 14px; border: 1px solid rgba(245,200,90,.75); border-radius: 0; background: rgba(245,200,90,.12); color: #f5c85a; font: 800 12px/1 Oswald, sans-serif; letter-spacing: .1em; text-decoration: none; text-transform: uppercase; cursor: pointer; }
        .gl-modal-actions button:disabled { opacity: .55; cursor: wait; }
        .gl-upload-status { color: #f5c85a; font: 700 12px/1.35 system-ui, sans-serif; }
        @keyframes gl-draw { to { stroke-dashoffset: 0; } }
        @media (max-width: 760px) { .gl-header { left: 9px; top: 7px; } .gl-title { font-size: 13px; } .gl-track-wrap { padding-left: 112px; } .gl-line { left: 92px; } .gl-track { grid-template-columns: repeat(7, 132px); gap: 12px; min-width: 1040px; } .gl-card { width: 130px; height: 93px; grid-template-columns: 66px minmax(0,1fr); } .gl-photo { width: 62px; height: 82px; } .gl-modal { grid-template-columns: 1fr; overflow-y: auto; } .gl-modal-media { min-height: 230px; max-height: 38vh; } .gl-modal-body { padding: 24px 20px 22px; } }
      `}</style>
    </div>
  );
}
