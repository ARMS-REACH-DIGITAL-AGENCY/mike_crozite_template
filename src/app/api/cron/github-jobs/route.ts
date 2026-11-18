import { NextRequest, NextResponse } from "next/server";
import { dueJobs } from "@/lib/githubJobSchedule";

// Pete, Nov 18 2026: Vercel Cron keeps the time for our GitHub workflows,
// because GitHub's own schedule ran them only every 7-10 hours. Every 5
// minutes this starts each workflow that is due (src/lib/githubJobSchedule.ts)
// unless a run of it is already queued or running.
//
// Needs GITHUB_DISPATCH_TOKEN in Vercel: a fine-grained GitHub token for
// ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template with "Actions: Read and
// write" only. Optional ?dry=1 lists what would start without starting it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO = "ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template";
const REF = "Easter-NEWS";
const API = `https://api.github.com/repos/${REPO}/actions/workflows`;

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization") || "";
  return Boolean(expected && bearer === `Bearer ${expected}`);
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "yatstats-job-scheduler",
  };
}

async function alreadyRunning(workflow: string, token: string): Promise<boolean> {
  for (const status of ["in_progress", "queued"]) {
    const res = await fetch(`${API}/${workflow}/runs?status=${status}&per_page=1`, {
      headers: headers(token),
      cache: "no-store",
    });
    if (!res.ok) return false; // can't tell: start it; workflow concurrency still applies
    const data = (await res.json()) as { total_count?: number };
    if ((data.total_count ?? 0) > 0) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const due = dueJobs(now);
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (dry || due.length === 0) {
    return NextResponse.json({ at: now.toISOString(), due, started: [], dry });
  }
  if (!token) {
    console.error("[github-jobs] GITHUB_DISPATCH_TOKEN is not set; nothing started", { due });
    return NextResponse.json({ at: now.toISOString(), due, error: "GITHUB_DISPATCH_TOKEN not set" }, { status: 500 });
  }

  const results = await Promise.all(
    due.map(async (workflow) => {
      try {
        if (await alreadyRunning(workflow, token)) return { workflow, result: "already running" };
        const res = await fetch(`${API}/${workflow}/dispatches`, {
          method: "POST",
          headers: { ...headers(token), "Content-Type": "application/json" },
          body: JSON.stringify({ ref: REF }),
        });
        return { workflow, result: res.status === 204 ? "started" : `failed HTTP ${res.status}` };
      } catch (err) {
        return { workflow, result: `failed ${err instanceof Error ? err.message : String(err)}` };
      }
    })
  );
  const failed = results.filter((r) => r.result.startsWith("failed"));
  if (failed.length) console.error("[github-jobs] some workflows did not start", failed);
  console.log("[github-jobs]", now.toISOString(), JSON.stringify(results));
  return NextResponse.json({ at: now.toISOString(), results }, { status: failed.length ? 502 : 200 });
}
