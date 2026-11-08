// src/lib/playerJourneySeo.ts
// Search title, description and structured data for a player profile.
//
// YAT?STATS documents a player's whole baseball journey, not just stats, so
// the search result tells that path: high school (with city and state, so it
// answers "what high school did <player> go to?") to the current team, read
// live from the same identity data the profile header shows. Nothing here is
// visible on the page itself (Pete, Nov 2026: no layout change).
//
// The current team is only named for ACTIVE or injured-list players with a
// team on record; otherwise the line is left out rather than guessed.

export type PlayerJourneyInput = {
  playerName: string;
  schoolName?: string;      // hsname, e.g. "Hamilton"
  schoolLocation?: string;  // hslocation, e.g. "Chandler,AZ"
  schoolUrl?: string;       // the school's canonical subdomain
  teamName?: string;        // current team, e.g. "New York Yankees"
  levelLabel?: string;      // official level, e.g. "MLB", "TRIPLE-A", "NCAA-D1"
  statusLabel?: string;     // e.g. "ACTIVE", "INJURED 10-DAY", "RETIRED"
};

function cityState(location?: string): { city: string; state: string; label: string } {
  const parts = String(location || '').split(',').map((s) => s.trim()).filter(Boolean);
  const state = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';
  const city = parts.length > 1 ? parts.slice(0, -1).join(', ') : parts[0] || '';
  return { city, state, label: [city, state].filter(Boolean).join(', ') };
}

function currentTeam(input: PlayerJourneyInput): { team: string; level: string; injured: boolean } | null {
  const status = String(input.statusLabel || '').trim().toUpperCase();
  const team = String(input.teamName || '').trim();
  const level = String(input.levelLabel || '').trim();
  const injured = status.startsWith('INJURED');
  if (!team || !(status === 'ACTIVE' || injured)) return null;
  return { team, level, injured };
}

export function playerJourneyMeta(input: PlayerJourneyInput): { title: string; description: string } {
  const name = input.playerName.trim() || 'Baseball Alumni';
  const school = String(input.schoolName || '').trim();
  const where = cityState(input.schoolLocation);
  const now = currentTeam(input);

  const title = school && now
    ? `${name}'s Baseball Journey: ${school} to ${now.team} | YAT?STATS`
    : school
      ? `${name}'s Baseball Journey from ${school}${where.label ? ` (${where.label})` : ''} | YAT?STATS`
      : `${name}'s Baseball Journey | YAT?STATS`;

  const hs = school
    ? `${name} played high school baseball at ${school}${where.label ? ` in ${where.label}` : ''}. `
    : '';
  const team = now
    ? `Now with ${now.team}${now.level ? ` (${now.level})` : ''}${now.injured ? ', on the injured list' : ''}. `
    : '';
  const description = `${hs}${team}Follow the full baseball journey: career timeline, photos, stories and stats.`;
  return { title, description };
}

/** schema.org ProfilePage for the player: alma mater and current team, machine-readable. */
export function playerJourneyJsonLd(input: PlayerJourneyInput & { profileUrl?: string; image?: string }) {
  const name = input.playerName.trim();
  if (!name) return null;
  const school = String(input.schoolName || '').trim();
  const where = cityState(input.schoolLocation);
  const now = currentTeam(input);
  const person: Record<string, unknown> = {
    '@type': 'Person',
    name,
    ...(input.profileUrl ? { url: input.profileUrl } : {}),
    ...(input.image ? { image: input.image } : {}),
    description: playerJourneyMeta(input).description,
  };
  if (school) {
    person.alumniOf = {
      '@type': 'HighSchool',
      name: school,
      ...(input.schoolUrl ? { url: input.schoolUrl } : {}),
      ...(where.label ? {
        address: {
          '@type': 'PostalAddress',
          ...(where.city ? { addressLocality: where.city } : {}),
          ...(where.state ? { addressRegion: where.state } : {}),
        },
      } : {}),
    };
  }
  if (now) person.memberOf = { '@type': 'SportsTeam', name: now.team, sport: 'Baseball' };
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    ...(input.profileUrl ? { url: input.profileUrl } : {}),
    mainEntity: person,
  };
}

/** JSON for a <script type="application/ld+json">, safe against "</script>" in names. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
