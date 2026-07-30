import { selectSponsorCampaign } from '@/lib/sponsorCampaigns';

export default function SponsorBanner({ hsid }: { hsid: string }) {
  const campaign = selectSponsorCampaign(hsid);

  if (!campaign) return null;

  return (
    <a
      className="yat-sponsor-slot"
      href={campaign.destinationUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      aria-label={campaign.altText}
      data-sponsor-id={campaign.id}
      data-sponsor-name={campaign.sponsorName}
    >
      <picture className="yat-sponsor-picture">
        <source media="(max-width: 640px)" srcSet={campaign.mobileImage} />
        <img
          className="yat-sponsor-image"
          src={campaign.desktopImage}
          alt={campaign.altText}
          width={1800}
          height={140}
          loading="eager"
          decoding="async"
        />
      </picture>
    </a>
  );
}
