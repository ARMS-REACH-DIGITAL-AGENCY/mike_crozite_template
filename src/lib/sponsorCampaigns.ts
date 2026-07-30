export type SponsorCampaign = {
  id: string;
  sponsorName: string;
  desktopImage: string;
  mobileImage: string;
  destinationUrl: string;
  altText: string;
  schoolIds: '*' | string[];
  startsAt?: string;
  endsAt?: string;
  rotationWeight?: number;
};

export const sponsorCampaigns: SponsorCampaign[] = [
  {
    id: 'travel-protection-club-shipsticks-75',
    sponsorName: 'The Travel Protection Club',
    desktopImage: '/ads/tpc-shipsticks-desktop.svg',
    mobileImage: '/ads/tpc-shipsticks-mobile.svg',
    destinationUrl: 'https://armsreachdigital.agency/tpc',
    altText: 'Claim $75 in ShipSticks travel credit from The Travel Protection Club',
    schoolIds: '*',
    rotationWeight: 1,
  },
];

function isActive(campaign: SponsorCampaign, now: Date): boolean {
  const startsAt = campaign.startsAt ? new Date(campaign.startsAt) : null;
  const endsAt = campaign.endsAt ? new Date(campaign.endsAt) : null;
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
}

function appliesToSchool(campaign: SponsorCampaign, hsid: string): boolean {
  return campaign.schoolIds === '*' || campaign.schoolIds.includes(hsid);
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) - result + value.charCodeAt(index)) | 0;
  }
  return Math.abs(result);
}

export function selectSponsorCampaign(
  hsid: string,
  now = new Date(),
): SponsorCampaign | null {
  const eligible = sponsorCampaigns.filter(
    (campaign) => isActive(campaign, now) && appliesToSchool(campaign, hsid),
  );

  if (!eligible.length) return null;

  const schoolSpecific = eligible.filter((campaign) => campaign.schoolIds !== '*');
  const candidates = schoolSpecific.length ? schoolSpecific : eligible;
  const weighted = candidates.flatMap((campaign) =>
    Array.from(
      { length: Math.max(1, Math.round(campaign.rotationWeight || 1)) },
      () => campaign,
    ),
  );
  const rotationWindow = Math.floor(now.getTime() / (10 * 60 * 1000));

  return weighted[hash(`${hsid}:${rotationWindow}`) % weighted.length] || null;
}
