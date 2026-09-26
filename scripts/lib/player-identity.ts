// Is an MLB Stats API person the same human as one of our tbc_players_raw
// rows? A matching name alone is never enough - common names collide (our
// Maranatha HS pitcher Carson Kelly is not the Cubs catcher Carson Kelly),
// and a same-name link makes a fan's card show a stranger's team, status
// and game log.
//
//   confirmed  - birthdates match; or they differ but the birth city
//                matches (a typo'd birthdate on one side); or we have no
//                birthdate and the birth city matches
//   conflict   - both birthdates known, different, and different birth city
//   unverified - not enough on our side to tell (no birthdate, and no
//                birth city match)
//
// Only "confirmed" may create or keep a link.

export type IdentityVerdict = "confirmed" | "conflict" | "unverified";

export interface OurPlayerIdentity {
  borndate?: string | null; // tbc_players_raw.borndate: "4/15/2005" (M/D/YYYY)
  place?: string | null; // tbc_players_raw.place: "Atlanta,GA"
}

export interface MlbPersonIdentity {
  birthDate?: string | null; // "2005-04-15"
  birthCity?: string | null; // "Atlanta"
}

// tbc_players_raw stores M/D/YYYY; MLB sends YYYY-MM-DD. Comparing the raw
// strings never matched, which silently disabled the old birthdate check.
export function toIsoDate(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

function normalizeCity(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function ourBirthCity(place: string | null | undefined): string {
  return normalizeCity((place ?? "").split(",")[0]);
}

export function identityVerdict(
  ours: OurPlayerIdentity,
  mlb: MlbPersonIdentity
): IdentityVerdict {
  const ourDate = toIsoDate(ours.borndate);
  const mlbDate = toIsoDate(mlb.birthDate);
  const ourCity = ourBirthCity(ours.place);
  const mlbCity = normalizeCity(mlb.birthCity);
  const sameCity = Boolean(ourCity && mlbCity && ourCity === mlbCity);

  if (ourDate && mlbDate) {
    if (ourDate === mlbDate) return "confirmed";
    return sameCity ? "confirmed" : "conflict";
  }

  return sameCity ? "confirmed" : "unverified";
}

// Recorded on player_source_map.match_method for a link that failed this
// check. resolvePlayerFromSourceMap() ignores these rows.
export const REJECTED_MATCH_METHOD = "rejected_bad_identity_match";
