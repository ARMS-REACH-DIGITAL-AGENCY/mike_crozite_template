// The card's next-game wording, shared by the flip card front and the Daily
// Digest so both always say the same thing (Pete, Nov 23 2026). Moved unchanged
// from src/components/yatstats/PlayerCardFront.tsx.

export function formatOpponentPrefix(value: string): string {
  const v = value.trim().toUpperCase();
  if (!v) return "";
  if (v === "AWAY" || v === "@") return "@";
  if (v === "HOME" || v === "VS" || v === "VS.") return "vs.";
  return value.trim();
}

function getLocalDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value || "0000";
  const month = parts.find((p) => p.type === "month")?.value || "00";
  const day = parts.find((p) => p.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

function formatGameDateInTimeZone(date: Date, timeZone: string) {
  return {
    dayLine: date.toLocaleDateString("en-US", { weekday: "long", timeZone }),
    dateLine: date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone,
    }),
  };
}

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  december: 11,
};

function parseDateOnlyText(value: string): { key: string; date: Date } | null {
  const raw = value.replace(/\s+/g, " ").trim();

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);

    return {
      key: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`,
      date: new Date(Date.UTC(year, month, day, 12, 0, 0)),
    };
  }

  const longMatch = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!longMatch) return null;

  const month = MONTH_INDEX[longMatch[1].toLowerCase()];
  if (month === undefined) return null;

  const day = Number(longMatch[2]);
  const year = Number(longMatch[3]);
  const monthNumber = String(month + 1).padStart(2, "0");
  const dayNumber = String(day).padStart(2, "0");

  return {
    key: `${year}-${monthNumber}-${dayNumber}`,
    date: new Date(Date.UTC(year, month, day, 12, 0, 0)),
  };
}

function formatDateOnlyText(date: Date) {
  return {
    dayLine: date.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    }),
    dateLine: date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

export function tryFormatGameDate(
  value: string,
  gameTimeUtc: string,
  timeZone: string,
) {
  const safeTimeZone = timeZone || "America/Phoenix";
  const raw = value.trim();
  const nowLocalDateKey = getLocalDateKey(new Date(), safeTimeZone);
  const parsedGameTimeUtc = new Date(gameTimeUtc);

  if (!Number.isNaN(parsedGameTimeUtc.getTime())) {
    const gameLocalDateKey = getLocalDateKey(parsedGameTimeUtc, safeTimeZone);
    const formatted = formatGameDateInTimeZone(parsedGameTimeUtc, safeTimeZone);

    return {
      dayLine: gameLocalDateKey === nowLocalDateKey ? "TODAY" : formatted.dayLine,
      dateLine: formatted.dateLine,
    };
  }

  if (!raw) return { dayLine: "TBD", dateLine: "" };

  function formatDatePart(dateText: string) {
    const dateOnly = parseDateOnlyText(dateText);

    if (dateOnly) {
      const formatted = formatDateOnlyText(dateOnly.date);
      return {
        dayLine: dateOnly.key === nowLocalDateKey ? "TODAY" : formatted.dayLine,
        dateLine: formatted.dateLine,
      };
    }

    const parsedDate = new Date(dateText);
    if (Number.isNaN(parsedDate.getTime())) return null;

    const dateKey = getLocalDateKey(parsedDate, safeTimeZone);
    const formatted = formatGameDateInTimeZone(parsedDate, safeTimeZone);

    return {
      dayLine: dateKey === nowLocalDateKey ? "TODAY" : formatted.dayLine,
      dateLine: formatted.dateLine,
    };
  }

  if (raw.toUpperCase().startsWith("TODAY |")) {
    const datePart = raw.split("|").slice(1).join("|").trim();
    return formatDatePart(datePart) || { dayLine: "TODAY", dateLine: datePart };
  }

  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const datePart = parts.slice(1).join(" | ");
    return formatDatePart(datePart) || { dayLine: parts[0], dateLine: datePart };
  }

  return formatDatePart(raw) || { dayLine: raw, dateLine: "" };
}


/**
 * The card's next-game lines from its own fields ("Friday | April 2, 2027" and
 * "vs. Peoria Javelinas"), exactly as PlayerCardFront builds them; null when the
 * card shows no next game (no date or no opponent).
 */
export function cardNextGameLines(nextGameDate: string, nextGameTimeUtc: string, timeZone: string, homeAway: string, opponent: string): { dateLine: string; opponentLine: string } | null {
  if (!nextGameDate.trim() || !opponent.trim()) return null;
  const { dayLine, dateLine } = tryFormatGameDate(nextGameDate, nextGameTimeUtc, timeZone);
  return { dateLine: dateLine ? `${dayLine} | ${dateLine}` : dayLine, opponentLine: `${formatOpponentPrefix(homeAway) || "vs."} ${opponent.trim()}` };
}
