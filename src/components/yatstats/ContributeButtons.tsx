'use client';

// Buttons that open the Connect & Contribute drawer on a given tab.
import { openContribute, type ContributeTab, type PhotoPurpose } from '@/lib/contribute';

const DOORS: { tab: ContributeTab; photoType?: PhotoPurpose; icon: string; title: string; text: string }[] = [
  { tab: 'photo', icon: 'ri-image-add-line', title: 'Photos', text: 'High School Photos for flip card fronts, headshots, action photos, Timeline Hero Images and school crests. The High School Photo is the one we need most.' },
  { tab: 'data', icon: 'ri-edit-2-line', title: 'Update Data', text: 'Missing or wrong stats, a graduation year, a team, player info, or your school\'s All-Time Next-Level List.' },
  { tab: 'missing', icon: 'ri-user-add-line', title: 'Missing Next-Level Alumni', text: 'Played at the next level and not on YAT?STATS? Tell us who he is.' },
  { tab: 'tip', icon: 'ri-newspaper-line', title: 'News Tip', text: 'A story about one of our alumni we should share.' },
];

export default function ContributeButtons() {
  return (
    <div className="ycb-grid">
      {DOORS.map((d) => (
        <button type="button" key={d.tab} className="ycb-door" onClick={() => openContribute({ tab: d.tab, photoType: d.photoType })}>
          <i className={d.icon} aria-hidden="true" />
          <span className="ycb-title">{d.title}</span>
          <span className="ycb-text">{d.text}</span>
        </button>
      ))}
      <style jsx global>{`
        .ycb-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 18px 0 8px; }
        .ycb-door { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,.04); color: inherit; text-align: left; cursor: pointer; }
        .ycb-door:hover { border-color: #FFD700; }
        .ycb-door i { font-size: 26px; color: #FFD700; }
        body.light-theme .ycb-door i { color: #9a6f00; }
        .ycb-title { font: 500 20px/1 Oswald, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
        .ycb-text { font-size: 13px; line-height: 1.45; opacity: .75; }
      `}</style>
    </div>
  );
}
