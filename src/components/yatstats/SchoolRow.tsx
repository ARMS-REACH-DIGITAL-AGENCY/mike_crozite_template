// src/components/yatstats/SchoolRow.tsx
// School crest + location + school name row
// #stickyIdentityImg — crest img; JS can swap to player headshot on profile pages
// #yatSectionLabel  — section breadcrumb; pages set this via JS
// #schoolRowRight   — right-side slot; gallery leaves empty, profile fills with fav button

import SafeImage from "@/components/SafeImage";

interface SchoolRowProps {
  crestUrl: string;
  schoolName: string;
  location: string;
  defaultSectionLabel: string;
}

export default function SchoolRow({ crestUrl, schoolName, location, defaultSectionLabel }: SchoolRowProps) {
  return (
    <div className="yat-schoolrow">
      <SafeImage
        id="stickyIdentityImg"
        className="yat-crest"
        src={crestUrl}
        alt={`${schoolName} crest`}
        data-crest={crestUrl}
      />
      <div className="yat-schooltext">
        <div className="small">{location}</div>
        <div className="big1">{schoolName}</div>
        <div className="big2" id="yatSectionLabel">{defaultSectionLabel}</div>
      </div>
      {/* Right slot — filled by page-specific JS (e.g., favorite button on player profile) */}
      <div id="schoolRowRight" className="yat-schoolrow-right" />
    </div>
  );
}
