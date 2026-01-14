// src/app/[hsid]/page.tsx

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  getRosterByHighSchool,
  getRosterByHsid,
  getSchoolByHsid,
  getSchoolByUrl,
} from "@/lib/db";

type SchoolLike = {
  school_name?: string;
  hsname?: string;
  high_school?: string;
  nicknametext?: string;
  nickname?: string;
  citynametext?: string;
  cityname?: string;
  regionnametext?: string;
  regionname?: string;
  regionidtext?: string;
  regionid?: string;

  current_aa?: number;
  mlb?: number;
  atnlaa?: number;

  microsite_url?: string;
  staging_url?: string;
};

function displaySchoolName(s: SchoolLike) {
  return s.school_name || s.hsname || s.high_school || "School";
}

function displayNickname(s: SchoolLike) {
  return s.nicknametext || s.nickname || "";
}

function displayLocation(s: SchoolLike) {
  const city = s.citynametext || s.cityname || "";
  const state = s.regionidtext || s.regionid || "";
  const region = s.regionnametext || s.regionname || "";

  if (city && state) return `${city}, ${state}`;
  if (city && region) return `${city}, ${region}`;
  return city || region || "";
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value: number | string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color:var(--surface)] px-3 py-1 text-sm">
      <span className="text-[color:var(--foreground)]/70">{label}</span>
      <span className="font-semibold tabular-nums">{value ?? 0}</span>
    </div>
  );
}

function PlayerCard({ player }: { player: any }) {
  return (
    <div className="group rounded-2xl border border-[var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow)]/20 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{player?.name ?? "Player"}</h2>
            <p className="mt-1 text-sm text-[color:var(--foreground)]/70">
              {player?.position ? String(player.position) : "—"}
            </p>
          </div>

          {player?.class_year ? (
            <div className="shrink-0 rounded-full border border-[var(--border)] bg-white/5 px-2 py-1 text-xs font-medium">
              {player.class_year}
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl border border-[var(--border)] bg-white/5 p-3">
            <div className="text-[color:var(--foreground)]/70">Team</div>
            <div className="mt-1 font-medium">{player?.team ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-white/5 p-3">
            <div className="text-[color:var(--foreground)]/70">Level</div>
            <div className="mt-1 font-medium">{player?.level ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3 text-xs text-[color:var(--foreground)]/70">
        <span className="truncate">{player?.player_id ? `ID: ${player.player_id}` : ""}</span>
        <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          View →
        </span>
      </div>
    </div>
  );
}

export default async function SchoolPage({ params }: { params: { hsid: string } }) {
  const h = await headers();
  const host = h.get("host") || "";

  // Prefer host-based lookup (staging_url / microsite_url)
  // db.ts normalizes, but it expects a URL-like string. Give it one.
  const hostUrl = host ? `https://${host}` : "";

  let school: SchoolLike | null = hostUrl ? await getSchoolByUrl(hostUrl, host) : null;
  let roster: any[] = [];

  if (school) {
    // If found via URL, fetch roster by high_school (matches your earlier logic)
    roster = await getRosterByHighSchool((school as any).high_school);
  } else {
    // Fallback: use numeric hsid from route
    const hsid = params.hsid;
    school = (await getSchoolByHsid(hsid)) as any;

    if (!school) {
      redirect("https://yatstats.com");
    }

    roster = await getRosterByHsid(hsid);
  }

  const name = displaySchoolName(school as SchoolLike);
  const nickname = displayNickname(school as SchoolLike);
  const location = displayLocation(school as SchoolLike);

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      {/* HEADER (prototype-style: clean, centered identity, right-side stats) */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[color:var(--background)]/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Brand */}
            <a href="https://yatstats.com" className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--surface-strong)] text-white shadow-[var(--shadow)]/30">
                <span className="text-sm font-bold">Y?</span>
              </div>
              <div className="hidden sm:block leading-tight">
                <div className="text-sm font-semibold">YAT?STATS</div>
                <div className="text-xs text-[color:var(--foreground)]/60">Microsites</div>
              </div>
            </a>

            {/* Center title */}
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-sm font-semibold sm:text-base">
                {name}
                {nickname ? <span className="text-[color:var(--foreground)]/60"> · {nickname}</span> : null}
              </div>
              <div className="truncate text-xs text-[color:var(--foreground)]/60">{location || " "}</div>
            </div>

            {/* Right stats + CTA */}
            <div className="hidden items-center gap-2 md:flex">
              <StatPill label="MLB" value={(school as any).mlb} />
              <StatPill label="AA" value={(school as any).current_aa} />
              <StatPill label="A/AA" value={(school as any).atnlaa} />
              <a
                href="https://yatstats.com"
                className="ml-2 rounded-full bg-[color:var(--surface-strong)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow)]/30 hover:opacity-95"
              >
                Main Site
              </a>
            </div>

            {/* Mobile CTA */}
            <a
              href="https://yatstats.com"
              className="md:hidden rounded-full border border-[var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm font-semibold"
            >
              Main Site
            </a>
          </div>
        </div>
      </header>

      {/* HERO BAR under header */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">
                Active Baseball Alumni
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-[color:var(--foreground)]/70">
                Current players connected to <span className="font-medium">{name}</span>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-[var(--border)] bg-[color:var(--surface)] px-3 py-1 text-sm">
                <span className="text-[color:var(--foreground)]/70">Players</span>{" "}
                <span className="font-semibold tabular-nums">{roster?.length ?? 0}</span>
              </div>
              <div className="rounded-full border border-[var(--border)] bg-[color:var(--surface)] px-3 py-1 text-sm">
                <span className="text-[color:var(--foreground)]/70">HSID</span>{" "}
                <span className="font-semibold tabular-nums">{params.hsid}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {roster && roster.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {roster.map((player: any) => (
              <PlayerCard key={player?.player_id ?? player?.id ?? player?.name} player={player} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[color:var(--surface)] p-8 text-center">
            <div className="text-lg font-semibold">No roster found</div>
            <p className="mt-2 text-sm text-[color:var(--foreground)]/70">
              We couldn’t find active players for this school right now.
            </p>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-[color:var(--foreground)]/70">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} YAT?STATS</span>
            <div className="flex items-center gap-4">
              <a className="hover:underline" href="https://yatstats.com">
                yatstats.com
              </a>
              <a className="hover:underline" href="https://yatstats.com">
                Support
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
