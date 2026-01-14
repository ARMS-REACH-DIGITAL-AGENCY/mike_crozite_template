// src/lib/db.ts

type UrlField = "microsite_url" | "staging_url";

// If you want an explicit “go live” switch, set this in Vercel env:
// YATSTATS_GO_LIVE=true (Production only)
function isGoLiveEnabled() {
  return String(process.env.YATSTATS_GO_LIVE || "").toLowerCase() === "true";
}

function normalizeUrl(input: string) {
  // Normalize into a consistent https URL without trailing slash
  // and without query/hash for matching
  const s = input.trim();
  const withProto = s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`;
  const u = new URL(withProto);

  u.protocol = "https:";      // treat http/https the same
  u.hash = "";
  u.search = "";

  // remove trailing slash (except root)
  const path = u.pathname.replace(/\/+$/, "") || "/";
  u.pathname = path;

  return u.toString();
}

function pickPreferredField(host: string): UrlField {
  const h = host.toLowerCase();

  // Anything clearly “sandbox/preview” should prefer staging_url
  if (
    h.endsWith(".vercel.app") ||
    h.includes("git-") || // many preview patterns
    h === "localhost" ||
    h.startsWith("5004.") // your sandbox domain
  ) {
    return "staging_url";
  }

  // Once production is approved, prefer microsite_url for real domains
  if (isGoLiveEnabled()) return "microsite_url";

  // Before approval, still allow matching live domains if they exist,
  // but keep staging as the preference until the flag flips.
  return "staging_url";
}

// Example signature — adjust to how you currently call it.
// Pass in fullUrl OR host+pathname; just make sure you build a full URL string.
export async function getSchoolByUrl(fullUrl: string, host?: string) {
  const url = normalizeUrl(fullUrl);
  const inferredHost = host ?? new URL(url).host;

  const preferred = pickPreferredField(inferredHost);
  const fallback: UrlField = preferred === "staging_url" ? "microsite_url" : "staging_url";

  // IMPORTANT: prefer one field, then fallback so code works in both phases.
  // Also normalize stored URLs similarly if needed (best: store normalized).
  const sql = `
    SELECT *
    FROM school_success
    WHERE ${preferred} = $1
    LIMIT 1;
  `;

  const primary = await queryOne(sql, [url]); // <- your existing helper
  if (primary) return primary;

  const sqlFallback = `
    SELECT *
    FROM school_success
    WHERE ${fallback} = $1
    LIMIT 1;
  `;

  return await queryOne(sqlFallback, [url]);
}