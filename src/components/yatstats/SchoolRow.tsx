// src/components/yatstats/SchoolRow.tsx
// School crest + location + school name row

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
      <SafeImage className="yat-crest" src={crestUrl} alt={`${schoolName} crest`} />
      <div className="yat-schooltext">
        <div className="small">{location}</div>
        <div className="big1">{schoolName}</div>
        <div className="big2" id="yatSectionLabel">{defaultSectionLabel}</div>
      </div>
    </div>
  );
}
