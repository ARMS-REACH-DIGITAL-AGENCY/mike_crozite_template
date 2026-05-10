// src/components/yatstats/CareerStrip.tsx
// Golden Line card strip for player profile Row 3.
// Row 4 now carries the actual timeline; this row stays short and focused on cards.
"use client";

import { useContext, useEffect, useMemo, useState } from "react";
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
};

function joinSchoolUrl(base: string, suffix = "") {
  const cleanBase = String(base || "").replace(/\/$/, "");
  return cleanBase ? `${cleanBase}${suffix}` : suffix || "/";
}

function flipCardHref(playerSchoolUrl: string | undefined, hsid: string, playerId: string) {
  if (!playerSchoolUrl && !hsid) return undefined;
  const base = playerSchoolUrl || `/${encodeURIComponent(hsid)}`;
  return joinSchoolUrl(base, `?view=active&player=${encodeURIComponent(playerId)}#player-${encodeURIComponent(playerId)}`);
}

function promptMoments(playerId: string, playerName: string, href?: string): CareerMoment[] {
  const firstName = playerName.split(" ")[0] || "this player";
  return [
    { id: "youth", year: "Before HS", stage: "Youth Baseball", title: "Before the lights", caption: `Upload a Little League, travel ball, backyard, or early baseball photo of ${firstName}.`, isUploadPrompt: true },
    { id: "middle", year: "Middle", stage: "Middle School", title: "The in-between years", caption: "Help fill the gap between youth baseball and the varsity years.", isUploadPrompt: true },
    { id: "high-school", year: "High School", stage: "High School", title: "The hometown chapter", caption: "Games, teammates, coaches, dugout moments, and memories from people who were there.", src: `${S3_BASE}/players/then/${playerId}.jpg`, href },
    { id: "college", year: "College", stage: "College", title: "Next-level chapter", caption: "Commitment day, campus visits, first college appearance, or photos with fans and family.", isUploadPrompt: true },
    { id: "minors", year: "Minors", stage: "Minor Leagues", title: "The grind", caption: "Road trips, small parks, autographs, prospect moments, and the climb.", src: `${S3_BASE}/players/back/${playerId}.jpg`, isUploadPrompt: true },
    { id: "majors", year: "MLB", stage: "Major Leagues", title: "The dream stage", caption: "Big-league debut, ballpark memories, signed items, or a fan moment you never forgot.", src: `${S3_BASE}/players/now/${playerId}.jpg`, isUploadPrompt: true },
  ];
}

function MomentImage({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);

  if (failed || !src) {
    return (
      <span className="gl-image-fallback" aria-hidden="true">
        <i className="ri-image-add-line" />
        <span>Add Photo</span>
      </span>
    );
  }

  return <img src={src} alt={title} onError={() => setFailed(true)} loading="lazy" />;
}

export default function CareerStrip({ playerId }: { playerId: string }) {
  const schoolData = useContext(SchoolContext);
  const playerProfile = usePlayerProfile();
  const [submittedMoments, setSubmittedMoments] = useState<SubmittedMoment[]>([]);

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
      uploaded: true,
    }));
    return [...base, ...uploads];
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

  function openUpload(moment: CareerMoment) {
    try {
      sessionStorage.setItem("yat:goldenLineStage", moment.stage || "Youth Baseball");
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
        </div>
        <button className="gl-add" type="button" onClick={() => openUpload(moments[0])}>+ Add Photo</button>
      </div>

      <div className="gl-track-wrap">
        <div className="gl-track" role="list" aria-label={`${playerName} career memories`}>
          {moments.map((moment, idx) => (
            <div className={`gl-slot gl-slot-${idx % 6}`} key={moment.id} role="listitem">
              <button type="button" className={`gl-card ${moment.isUploadPrompt ? "gl-card-prompt" : ""}`} onClick={() => moment.href && !moment.isUploadPrompt ? (window.location.href = moment.href) : openUpload(moment)} aria-label={`Open ${moment.title}`}>
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

      <style jsx>{`
        .golden-line-strip {
          position: relative;
          height: 100%;
          min-height: 100px;
          overflow: hidden;
          isolation: isolate;
          background: linear-gradient(90deg, rgba(16,16,16,.98), rgba(8,8,8,.98));
          border-top: 1px solid rgba(255,255,255,.08);
        }
        .gl-header { position: absolute; z-index: 3; left: 12px; top: 7px; display: flex; align-items: center; gap: 9px; color: #fff; text-transform: uppercase; pointer-events: none; }
        .gl-kicker, .gl-title { display: block; white-space: nowrap; }
        .gl-kicker { font: 800 9px/1 Oswald, sans-serif; letter-spacing: .15em; color: #f5c85a; }
        .gl-title { margin-top: 2px; font: 800 14px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .08em; }
        .gl-add { pointer-events: auto; border: 1px solid rgba(245,200,90,.72); border-radius: 0; padding: 5px 8px 4px; background: rgba(0,0,0,.58); color: #f5c85a; font: 800 9px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
        .gl-track-wrap { height: 100%; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; padding-left: 142px; padding-right: 18px; }
        .gl-track-wrap::-webkit-scrollbar { display: none; }
        .gl-track { height: 100%; min-width: 1030px; display: grid; grid-template-columns: repeat(7, 118px); align-items: end; gap: 10px; padding-bottom: 8px; }
        .gl-slot { transform: translateY(0) rotate(-1.2deg); }
        .gl-slot-1 { transform: translateY(-4px) rotate(1deg); } .gl-slot-2 { transform: translateY(0) rotate(-.6deg); } .gl-slot-3 { transform: translateY(-5px) rotate(.8deg); } .gl-slot-4 { transform: translateY(0) rotate(-.8deg); } .gl-slot-5 { transform: translateY(-4px) rotate(1deg); }
        .gl-card { position: relative; display: grid; grid-template-columns: 56px minmax(0,1fr); align-items: stretch; width: 118px; height: 84px; padding: 4px; border: 1px solid rgba(255,255,255,.18); border-radius: 0; background: linear-gradient(135deg, rgba(29,29,29,.98), rgba(7,7,7,.92)); color: #fff; text-align: left; cursor: pointer; box-shadow: 0 8px 18px rgba(0,0,0,.34); transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .gl-card:hover, .gl-card:focus-visible { transform: translateY(-4px) scale(1.03); border-color: rgba(245,200,90,.94); box-shadow: 0 0 18px rgba(245,200,90,.22), 0 10px 24px rgba(0,0,0,.5); outline: none; }
        .gl-card-prompt { border-style: dashed; }
        .gl-photo { display: block; width: 54px; height: 76px; overflow: hidden; border: 1px solid rgba(245,200,90,.5); border-radius: 0; background: #111; }
        .gl-photo img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top center; }
        .gl-image-fallback { width: 100%; height: 100%; display: grid; align-content: center; justify-items: center; gap: 4px; color: rgba(245,200,90,.88); background: linear-gradient(135deg, #272727, #0e0e0e); font-size: 18px; }
        .gl-image-fallback span { font: 800 7px/1 Oswald, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
        .gl-copy { min-width: 0; padding: 4px 1px 3px 6px; align-self: stretch; display: flex; flex-direction: column; }
        .gl-year, .gl-stage, .gl-card-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
        .gl-year { color: #f5c85a; font: 800 8px/1 Oswald, sans-serif; letter-spacing: .1em; }
        .gl-stage { margin-top: 4px; color: rgba(255,255,255,.92); font: 800 12px/1 "Bebas Neue", Oswald, sans-serif; letter-spacing: .05em; }
        .gl-card-title { margin-top: auto; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: rgba(255,255,255,.68); font: 700 8px/1.05 Oswald, sans-serif; letter-spacing: .06em; }
        @media (max-width: 760px) { .gl-header { left: 8px; } .gl-track-wrap { padding-left: 112px; } .gl-track { min-width: 920px; grid-template-columns: repeat(7, 108px); gap: 8px; } .gl-card { width: 108px; height: 77px; grid-template-columns: 50px minmax(0,1fr); } .gl-photo { width: 48px; height: 69px; } }
      `}</style>
    </div>
  );
}
