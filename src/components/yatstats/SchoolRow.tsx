// src/components/yatstats/SchoolRow.tsx
// School crest + location + school name row.
// #yatSectionLabel is filled by each page (YatInteractivity on gallery; inline script on player profile).
// #schoolRowRight is a slot for page-specific right-side controls (e.g. FAVORITE button on player profile).

import SafeImage from "@/components/SafeImage";

interface SchoolRowProps {
  crestUrl: string;
  schoolName: string;
  location: string;
}

export default function SchoolRow({ crestUrl, schoolName, location }: SchoolRowProps) {
  return (
    <div className="yat-schoolrow">
      <SafeImage className="yat-crest" src={crestUrl} alt={`${schoolName} crest`} />
      <div className="yat-schooltext">
        <div className="small">{location}</div>
        <div className="big1">{schoolName}</div>
        <div className="big2" id="yatSectionLabel" aria-live="polite" />
      </div>
      <div id="schoolRowRight" />
    </div>
  );
}
