'use client';

// The proof a fan checks before a photo is sent: their photo, cropped the
// way they placed it, shown in the spot it will fill on the site - his flip
// card, his headshot, his Career Path Timeline slide for that season, the
// school's crest - with every place that photo appears listed under it.

import type { Crop, PhotoPurpose, Season } from '@/lib/contribute';

const S3 = 'https://yatstats-assets.s3.us-west-2.amazonaws.com';

export type ProofPlayer = { name: string; classOf: number | null; currentTeam: string; schoolName: string; schoolLocation: string };

// Every place the photo shows on the site, in the site's own words.
const SPOTS: Record<PhotoPurpose, (p: ProofPlayer, s: Season | null) => string[]> = {
  flip_card: (p) => [`The front of ${first(p.name)}'s flip card, in the Active Alumni and All-Time galleries`, `The high school photo on his profile page`],
  headshot: (p) => [`${first(p.name)}'s headshot in Row 3 of the galleries`, 'His profile page, Global Search and Favorites', 'Alumni News stories about him'],
  back_hero: (p) => [`The back of ${first(p.name)}'s flip card`, 'His profile page'],
  timeline_hero: (p, s) => [`The ${s?.year || ''} slide of ${first(p.name)}'s Career Path Timeline, on his profile page`.replace('The  slide', 'A slide')],
  other_photo: () => ['Kept for the YAT?STATS team, who will place it where it fits best'],
  school_logo: (p) => [`The school crest in Row 2 of every page of ${p.schoolName || 'the school'}'s hub`, 'Global Search, Favorites and flip cards from this school'],
  team_logo: () => ["The team's logo on flip cards, in Global Search and on the Career Path Timeline of everyone who played there"],
};

const first = (name: string) => name.split(' ')[0] || name;
const last = (name: string) => name.split(' ').slice(1).join(' ') || name;

// The photo cut to the fan's crop, filling its box.
function Cropped({ src, crop, className }: { src: string; crop: Crop | null; className?: string }) {
  if (!crop) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={src} alt="" style={{ objectFit: 'cover', width: '100%', height: '100%' }} />;
  }
  return (
    <span className={`ypf-crop ${className || ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        style={{
          width: `${100 / crop.w}%`,
          height: `${100 / crop.h}%`,
          left: `${(-crop.x / crop.w) * 100}%`,
          top: `${(-crop.y / crop.h) * 100}%`,
        }}
      />
    </span>
  );
}

function FlipCardFront({ src, crop, p }: { src: string; crop: Crop | null; p: ProofPlayer }) {
  return (
    <div className="ypf-card">
      <Cropped src={src} crop={crop} />
      <div className="ypf-card-shade" />
      <div className="ypf-card-text">
        <div className="ypf-card-first">{first(p.name)}</div>
        <div className="ypf-card-last">{last(p.name)}</div>
        {p.currentTeam ? <div className="ypf-card-team">{p.currentTeam}</div> : null}
        {p.classOf ? <span className="ypf-chip">Class of {p.classOf}</span> : null}
      </div>
    </div>
  );
}

function Headshot({ src, crop, p }: { src: string; crop: Crop | null; p: ProofPlayer }) {
  return (
    <div className="ypf-row3">
      {[0, 1, 2].map((i) => (
        <div className={`ypf-slot${i === 1 ? ' is-new' : ''}`} key={i}>
          <div className="ypf-circle">{i === 1 ? <Cropped src={src} crop={crop} className="ypf-face" /> : null}</div>
          <div className="ypf-slot-name">{i === 1 ? last(p.name) : ''}</div>
        </div>
      ))}
    </div>
  );
}

// The back of the card: the photo is a wide strip across the top with his
// name printed over its left side, stats below.
function FlipCardBack({ src, crop, p }: { src: string; crop: Crop | null; p: ProofPlayer }) {
  return (
    <div className="ypf-back">
      <div className="ypf-back-photo">
        <Cropped src={src} crop={crop} />
        <div className="ypf-back-name"><b>{first(p.name)}</b><b>{last(p.name)}</b><span>{p.currentTeam}</span></div>
      </div>
      <div className="ypf-back-stats">{['G', 'AVG', 'HR', 'RBI'].map((k) => <span key={k}><small>{k}</small>–</span>)}</div>
      <div className="ypf-back-lines" />
    </div>
  );
}

function TimelineSlide({ src, crop, p, s, landscape }: { src: string; crop: Crop | null; p: ProofPlayer; s: Season | null; landscape: boolean }) {
  return (
    <div className="ypf-slide" style={s?.teamId ? { ['--ypf-logo' as string]: `url(${S3}/teams-web/${s.teamId}.webp)` } : undefined}>
      <div className="ypf-slide-left">
        <b>{p.name}</b>
        <small>{[s?.level, s?.label].filter(Boolean).join(' · ')}</small>
        {p.classOf ? <small className="ypf-gold">Class of {p.classOf}</small> : null}
      </div>
      <div className={`ypf-slide-person${landscape ? ' is-wide' : ''}`}><Cropped src={src} crop={crop} /></div>
      <div className="ypf-slide-right">
        <small className="ypf-gold">{[s?.year, s?.level].filter(Boolean).join(' · ')}</small>
        <b>{s?.team || ''}</b>
      </div>
      <div className="ypf-slide-rail"><span className="ypf-slide-year">{s?.year}</span></div>
    </div>
  );
}

function TeamLogo({ src, name }: { src: string; name: string }) {
  return (
    <div className="ypf-row2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" />
      <div><small>Team logo</small><b>{name}</b></div>
    </div>
  );
}

function SchoolCrest({ src, p }: { src: string; p: ProofPlayer }) {
  return (
    <div className="ypf-row2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" />
      <div>
        <small>{p.schoolLocation}</small>
        <b>{p.schoolName}</b>
        <b>Active Baseball Alumni</b>
      </div>
    </div>
  );
}

export default function ContributeProof({
  purpose, src, crop, player, season, landscape = false, teamName = '', tagged = [],
}: {
  purpose: PhotoPurpose; src: string; crop: Crop | null; player: ProofPlayer; season: Season | null;
  landscape?: boolean; teamName?: string; teamId?: string; tagged?: string[];
}) {
  const spots = SPOTS[purpose](player, season);
  return (
    <div className="ypf">
      <div className="ypf-stage">
        {purpose === 'flip_card' ? <FlipCardFront src={src} crop={crop} p={player} />
          : purpose === 'headshot' ? <Headshot src={src} crop={crop} p={player} />
          : purpose === 'back_hero' ? <FlipCardBack src={src} crop={crop} p={player} />
          : purpose === 'timeline_hero' ? <TimelineSlide src={src} crop={crop} p={player} s={season} landscape={landscape} />
          : purpose === 'school_logo' ? <SchoolCrest src={src} p={player} />
          : purpose === 'team_logo' ? <TeamLogo src={src} name={teamName} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img className="ypf-plain" src={src} alt="" />}
      </div>
      <div className="ypf-where">
        <div className="ypf-where-title">This photo will appear:</div>
        <ul>{spots.map((t) => <li key={t}>{t}</li>)}</ul>
        {purpose === 'timeline_hero' ? <div className="ypf-note">We cut him out of the background, like the other slides on his timeline.</div> : null}
        {tagged.length > 1 ? <div className="ypf-note">Tagged: {tagged.join(', ')}.</div> : null}
      </div>
      <style jsx global>{`
        .ypf { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; }
        @media (min-width: 900px) { .ypf { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); } }
        .ypf-stage { display: flex; justify-content: center; }
        .ypf-crop { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; }
        .ypf-crop img { position: absolute; max-width: none; }
        .ypf-where-title { font: 600 15px/1.2 Oswald, sans-serif; letter-spacing: .05em; text-transform: uppercase; margin-bottom: 6px; }
        .ypf-where ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.5; }
        .ypf-note { margin-top: 8px; font-size: 12px; opacity: .7; }
        .ypf-gold { color: #FFD700; }
        /* Flip card front */
        .ypf-card { position: relative; width: min(100%, 260px); aspect-ratio: 5 / 7; border-radius: 10px; overflow: hidden; background: #111; box-shadow: 0 6px 20px rgba(0,0,0,.5); }
        .ypf-card-shade { position: absolute; inset: 45% 0 0; background: linear-gradient(transparent, rgba(0,0,0,.85)); }
        .ypf-card-text { position: absolute; left: 12px; right: 12px; bottom: 12px; color: #fff; }
        .ypf-card-first, .ypf-card-last { font: 700 26px/.95 Oswald, sans-serif; text-transform: uppercase; }
        .ypf-card-last { font-size: 30px; }
        .ypf-card-team { font: 600 13px/1.3 Archivo, sans-serif; margin-top: 4px; }
        .ypf-chip { display: inline-block; margin-top: 6px; padding: 3px 8px; border: 1px solid rgba(255,255,255,.5); border-radius: 999px; font: 600 10px/1 Archivo, sans-serif; text-transform: uppercase; }
        /* Row 3 headshot */
        .ypf-row3 { display: flex; gap: 10px; padding: 10px 12px; background: #000; border-radius: 10px; }
        .ypf-slot { display: flex; flex-direction: column; align-items: center; gap: 4px; opacity: .35; }
        .ypf-slot.is-new { opacity: 1; }
        .ypf-circle { width: 84px; height: 84px; border-radius: 50%; overflow: hidden; border: 2px solid #ddd; background: #1a1a1a; }
        .ypf-slot.is-new .ypf-circle { border-color: #FFD700; }
        .ypf-slot-name { min-height: 14px; font: 400 13px/1 Oswald, sans-serif; text-transform: uppercase; color: #ddd; }
        /* Flip card back */
        .ypf-back { width: min(100%, 300px); aspect-ratio: 5 / 7; display: flex; flex-direction: column; gap: 8px; padding: 8px; border-radius: 10px; overflow: hidden; background: #c2b9ae; box-shadow: 0 6px 20px rgba(0,0,0,.5); }
        .ypf-back-photo { position: relative; aspect-ratio: 20 / 7; border: 2px solid rgba(30,22,14,.65); border-radius: 4px; overflow: hidden; }
        .ypf-back-name { position: absolute; left: 6px; top: 6px; display: flex; flex-direction: column; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
        .ypf-back-name b { font: 700 13px/1 Oswald, sans-serif; text-transform: uppercase; }
        .ypf-back-name span { font-size: 9px; }
        .ypf-back-lines { flex: 1; background: repeating-linear-gradient(transparent 0 14px, rgba(30,22,14,.18) 14px 15px); }
        .ypf-back-stats { display: grid; grid-template-columns: repeat(4, 1fr); color: #1e160e; font: 600 14px/1 Oswald, sans-serif; text-align: center; }
        .ypf-back-stats small { display: block; font-size: 9px; opacity: .6; margin-bottom: 2px; }
        /* Career Path Timeline slide */
        .ypf-slide { position: relative; width: 100%; max-width: 560px; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; color: #fff;
          background: var(--ypf-logo, none) right 6% center / 38% no-repeat, radial-gradient(circle at 55% 80%, rgba(255,170,40,.35), transparent 55%), linear-gradient(135deg, #2a2f36, #0b0c0e); }
        .ypf-slide::before { content: ""; position: absolute; inset: 0; background: rgba(0,0,0,.35); }
        .ypf-slide-left { position: absolute; z-index: 1; left: 4%; top: 6%; display: flex; flex-direction: column; gap: 2px; max-width: 34%; }
        .ypf-slide-left b { font: 700 clamp(13px, 2.6vw, 18px)/1 Oswald, sans-serif; text-transform: uppercase; }
        .ypf-slide-left small { font: 500 clamp(8px, 1.4vw, 10px)/1.2 Oswald, sans-serif; text-transform: uppercase; opacity: .85; }
        .ypf-slide-person { position: absolute; z-index: 1; left: 30%; bottom: 10%; height: 82%; aspect-ratio: 5 / 7; border-radius: 6px; overflow: hidden; outline: 2px dashed rgba(255,215,0,.7); }
        .ypf-slide-person.is-wide { left: 26%; height: 58%; aspect-ratio: 7 / 5; }
        .ypf-slide-right { position: absolute; z-index: 1; right: 4%; top: 10%; display: flex; flex-direction: column; align-items: flex-start; max-width: 40%; }
        .ypf-slide-right small { font: 500 clamp(8px, 1.4vw, 11px)/1 Oswald, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
        .ypf-slide-right b { font: 700 clamp(14px, 3vw, 24px)/1 Oswald, sans-serif; text-transform: uppercase; margin-top: 4px; }
        .ypf-slide-rail { position: absolute; z-index: 1; left: 4%; right: 4%; bottom: 5%; height: 3px; background: repeating-linear-gradient(90deg, #e33 0 10px, transparent 10px 16px); }
        .ypf-slide-year { position: absolute; right: 8%; top: -10px; padding: 2px 6px; background: #000; font: 700 12px/1 Oswald, sans-serif; color: #FFD700; }
        /* Row 2 crest */
        .ypf-row2 { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #000; border-radius: 10px; color: #fff; width: 100%; max-width: 420px; }
        .ypf-row2 img { width: 60px; height: 60px; object-fit: contain; outline: 2px dashed rgba(255,215,0,.7); }
        .ypf-row2 div { display: flex; flex-direction: column; }
        .ypf-row2 small { font: 400 11px/1 Oswald, sans-serif; text-transform: uppercase; opacity: .7; }
        .ypf-row2 b { font: 700 16px/1.05 Oswald, sans-serif; text-transform: uppercase; }
        .ypf-plain { max-width: 260px; max-height: 280px; object-fit: contain; border-radius: 8px; }
      `}</style>
    </div>
  );
}
