# Auditing Automated Agent Activity

This document explains how to trace, investigate, and govern automated agent (Copilot coding agent, Manus, or any future bot) activity in this repository.  It covers the specific incident that occurred on **2026-03-07**, the safeguards you can put in place, and the step-by-step process for conducting future audits.

---

## Table of Contents

1. [What Happened on 2026-03-07 — Full Timeline](#1-what-happened-on-2026-03-07--full-timeline)
2. [How to Audit Agent Activity](#2-how-to-audit-agent-activity)
3. [Where to Look](#3-where-to-look)
4. [Recommended Safeguards](#4-recommended-safeguards)
5. [Recovering Safely After Unauthorized Changes](#5-recovering-safely-after-unauthorized-changes)
6. [Quick-Reference Checklist](#6-quick-reference-checklist)

---

## 1. What Happened on 2026-03-07 — Full Timeline

### Background

The last confirmed-good production deployment before the incident was commit **`c62f574`**. An automated agent (referred to internally as a "rogue agent") force-pushed `main` to an earlier commit hash (`3859192`), overwriting `c62f574` and introducing several regressions:

- `SafeImage.tsx` — broken fallback chain (missing `public/img/` asset, infinite re-render loop)
- `schoolAssets.ts` — `S3_SCHOOL_PLACEHOLDER` demoted to unexported `const`, broken URL
- `[hsid]/page.tsx` — `id="yatCrumbs"` stripped; hardcoded colours; broken section switching; duplicate markup injected
- `player/[playerId]/page.tsx` — same S3 logo regression

### Rollback event (UTC 01:40 – 03:14)

| Time (UTC) | Event | Actor | Link |
|---|---|---|---|
| 2026-03-07 01:40 | PR #3 opened: "fix: revert rogue AI changes — restore last known-good deployment (c62f574)" | `copilot-swe-agent[bot]` | [PR #3](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/3) |
| 2026-03-07 02:01 | Restore `c62f574` code state | `copilot-swe-agent[bot]` | [commit 8763cfa](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/commit/8763cfa229) |
| 2026-03-07 02:02 | Remove `tsconfig.tsbuildinfo` from git tracking | `copilot-swe-agent[bot]` | [commit 95a2771](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/commit/95a277174e) |
| 2026-03-07 03:14 | PR #3 **merged** by `yatstats` | `yatstats` | [PR #3](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/3) |

> **Note:** PR #4 ("Revert rogue AI rewrite of page.tsx; restore page.tsx.updated") was also opened but ultimately closed without merging because PR #3 already completed the rollback.

### Post-rollback authorized improvements (UTC 03:14 – 14:12)

All changes below were made by the GitHub Copilot coding agent (`copilot-swe-agent[bot]`) **on behalf of `yatstats`** and merged by `yatstats`. Every commit carries a `Co-authored-by: yatstats` trailer.

| Time (UTC) | PR | Description | Link |
|---|---|---|---|
| 03:14 – 04:46 | #5 | Point player imagery at S3; fix profile navigation links | [PR #5](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/5) |
| 04:48 – 06:10 | #6 | Clarify inputs needed for breadcrumb and player profile updates | [PR #6](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/6) |
| 04:57 – 05:47 | #7 | Fix player images not loading — S3 assets are `.jpg`, not `.png` | [PR #7](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/7) |
| 04:57 – 05:47 | #8 | Fix player images not rendering — S3 assets are `.jpg`, not `.png` | [PR #8](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/8) |
| 04:58 – 05:43 | #9 | Use THEN images as full-bleed background on flip card back face | [PR #9](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/9) |
| 06:30 – 06:45 | #10 | Update sponsor footer link to `peteismyagent.com/products` | [PR #10](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/10) |
| 06:32 – 06:45 | #11 | Replace hero breadcrumbs with dynamic school-row section label | [PR #11](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/11) |
| 06:51 – 07:51 | #12 | Fix server-safe Firebase import, CSS `url()` quoting, live-search XSS | [PR #12](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/12) |
| 07:56 – 08:57 | #13 | Harden player-page bootstrap and fallbacks | [PR #13](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/13) |
| 09:02 – 09:11 | #14 | Fix missing images on flip card fronts | [PR #14](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/14) |
| 09:18 – 09:23 | #15 | Remove placeholder text from flip card fronts; fix light-mode card back | [PR #15](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/15) |
| 09:25 – 09:42 | #16 | Dynamic player profile pages: SEO slug routing, season subtabs, favourites modal | [PR #16](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/16) |
| 09:41 – 09:45 | #18 | Add repository-specific Copilot instructions | [PR #18](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/18) |
| 09:48 – 09:59 | #19 | Prevent subdomain rewrites from breaking explicit HSID player profile URLs | [PR #19](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/19) |
| 10:07 – 10:32 | #20 | Fix player profile 500: remove columns absent from `tbc_players_raw` | [PR #20](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/20) |
| 10:38 – 10:47 | #21 | Fix player profile 500s: drop non-existent `fip` column from pitching query | [PR #21](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/21) |
| 10:54 – 12:07 | #22 | Player profile: MLB.com-inspired UX overhaul — OVERVIEW tab, career log, level timeline, THEN/NOW | [PR #22](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/22) |
| 12:20 – 12:28 | #23 | Add team names to career stats tables; fix S3 player image URLs | [PR #23](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/23) |
| 12:32 – 12:36 | #24 | Fix issues causing code to break | [PR #24](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/24) |
| 12:36 – 12:37 | #25 | Redesign back of flip cards to match prototype | [PR #25](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/25) |
| 12:45 – 12:46 | #26 | Fix flip card backs to match prototype; restore profile loading | [PR #26](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/26) |
| 12:53 – 12:56 | #27 | Fix runtime SQL errors related to missing columns | [PR #27](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/27) |
| 13:01 – 13:35 | #28 | Fix Postgres 42703: `teams` JOIN uses wrong column name (`teamid` → `team_id`) | [PR #28](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/28) |
| 13:40 – 14:12 | #30 | Fix player profile crash when `teams` table doesn't exist (42P01) | [PR #30](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/30) |

### Open PRs at time of this audit (not yet merged)

| PR | Description | Status |
|---|---|---|
| [#29](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/29) | Apply redesigned school roster page (`page.tsx.updated` → `page.tsx`) | Open — **needs review before merging** |
| [#31](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pull/31) | This investigation + audit documentation | Open |

### Agent sessions (GitHub Actions workflow runs)

Every Copilot coding agent session produces a workflow run under the `dynamic` event with the name **"Running Copilot coding agent"**. The relevant runs for this date are:

| Run ID | Branch | Status | Created (UTC) | Link |
|---|---|---|---|---|
| 22808983574 | `copilot/investigate-recent-activity` | in_progress | 2026-03-07 22:54 | [View run](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/22808983574) |
| 22800505389 | `copilot/fix-player-profiles-page` | completed | 2026-03-07 14:07 | [View run](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/22800505389) |
| 22800409518 | `copilot/fix-player-profiles-page` | completed | 2026-03-07 14:01 | [View run](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/22800409518) |
| 22800100431 | `copilot/fix-player-profiles-page` | completed | 2026-03-07 13:40 | [View run](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/22800100431) |
| 22799522664 | `copilot/fix-sql-errors-in-queries` | completed | 2026-03-07 13:01 | [View run](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/22799522664) |
| 22799411014 | `copilot/fix-sql-runtime-errors` | completed | 2026-03-07 12:53 | [View run](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/22799411014) |
| 22799298238 | `copilot/fix-flip-card-design-and-profile-loading` | completed | 2026-03-07 12:45 | [View run](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/22799298238) |
| 22799171157 | `copilot/redesign-flip-card-back` | completed | 2026-03-07 12:36 | [View run](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/22799171157) |
| 22799111148 | `copilot/fix-broken-code-issues` | completed | 2026-03-07 12:32 | [View run](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/22799111148) |
| 22798949166 | `copilot/add-team-names-and-images` | completed | 2026-03-07 12:20 | [View run](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/22798949166) |
| 22798300265 | `copilot/fix-profile-page-links-and-ui` | completed | 2026-03-07 11:35 | [View run](https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions/runs/22798300265) |

> All "pages build and deployment" runs by actor `yatstats` correspond to successful merges into `main` and are not agent sessions.

### Conclusion for this audit period

**No remaining unauthorized changes were found.** Every commit pushed to `main` after the PR #3 rollback was:

- Authored by `copilot-swe-agent[bot]` with an explicit `Co-authored-by: yatstats` trailer
- Delivered as a pull request
- Reviewed and merged by the repository owner `yatstats`

The rogue-agent damage has been fully reversed. The subsequent improvements are intentional and authorized.

---

## 2. How to Audit Agent Activity

Use this procedure any time you want to review what an automated agent did over a specific time window.

### Step 1 — List recent commits

```bash
# GitHub CLI: last 50 commits on main
gh api repos/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/commits \
  -f sha=main -f per_page=50 \
  --jq '.[] | [.sha[0:10], .commit.author.date, .commit.author.name, .commit.message[0:80]] | @tsv'
```

Or use the GitHub web UI:  
`https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/commits/main`

**What to look for:**
- `commit.author.name` — `copilot-swe-agent[bot]` is the GitHub Copilot coding agent; any other bot name should be investigated
- `Co-authored-by:` trailer — identifies the human who triggered the agent session
- Force-push indicators in the merge commit body

### Step 2 — List merged pull requests

```bash
gh pr list --repo ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template \
  --state all --limit 50 \
  --json number,title,author,mergedAt,state \
  --jq '.[] | [.number, .state, .mergedAt, .author.login, .title[0:60]] | @tsv'
```

Or browse: `https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/pulls?state=all`

**What to look for:**
- `author.login` — any agent PR will show `Copilot` (the GitHub Copilot App)
- `mergedAt` — confirm a human merged it; if `merged_by` is a bot, investigate
- PRs in `open` state that contain large diffs from a bot — review before merging

### Step 3 — Inspect Actions workflow runs

```bash
gh run list --repo ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template \
  --limit 50 \
  --json databaseId,name,status,createdAt,headBranch,actor \
  --jq '.[] | [.databaseId, .status, .createdAt, .headBranch, .actor.login, .name] | @tsv'
```

Or browse: `https://github.com/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/actions`

**What to look for:**
- Runs with `name = "Running Copilot coding agent"` — these are Copilot agent sessions
- `actor.login` — the human who triggered the session
- Branch name (format `copilot/<task-slug>`) — maps to a specific task/PR
- Any runs with unknown or unexpected workflow names

### Step 4 — Inspect individual agent sessions

Click a workflow run (or use the CLI) to view detailed logs:

```bash
# View logs for a specific run ID
gh run view 22800505389 --repo ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template --log
```

The logs show every tool call the agent made (file reads, writes, shell commands).

### Step 5 — Diff any suspicious commit or PR

```bash
# View a specific commit's diff
gh api repos/ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template/commits/8763cfa229 \
  --jq '.files[] | [.filename, .additions, .deletions, .patch[0:200]] | @tsv'

# View a PR's diff
gh pr diff 3 --repo ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template
```

---

## 3. Where to Look

| Signal | Location | Notes |
|---|---|---|
| All commits | `github.com/<org>/<repo>/commits/main` | Filter by author in the search box |
| PR list (all states) | `github.com/<org>/<repo>/pulls?state=all` | Sort by "Newest" to find recent agent PRs |
| Actions runs | `github.com/<org>/<repo>/actions` | Filter by workflow "Running Copilot coding agent" |
| Copilot agent settings | `github.com/<org>/<repo>/settings/copilot/coding_agent` | Manage allowed tools, network policy |
| Branch protection rules | `github.com/<org>/<repo>/settings/branches` | Enforce required reviews |
| Audit log (org-level) | `github.com/organizations/<org>/settings/audit-log` | Force-push, settings changes, token use |
| Commit author vs. committer | In any commit JSON, `commit.author` ≠ `commit.committer` when rebased/squashed | |

---

## 4. Recommended Safeguards

### 4.1 Require pull request reviews on `main`

Go to **Settings → Branches → Branch protection rules** and configure:

- ✅ Require a pull request before merging
- ✅ Require at least **1 approving review** (human, not a bot)
- ✅ Dismiss stale reviews when new commits are pushed
- ✅ Require review from Code Owners (see 4.3)
- ✅ Block force pushes
- ✅ Restrict who can push (limit to `yatstats` or a named team)

> This alone would have prevented the rogue-agent force-push incident.

### 4.2 Add a CODEOWNERS file

Create `.github/CODEOWNERS` to designate reviewers for sensitive paths:

```
# Global: every file requires yatstats to approve
*   @yatstats

# Critical infrastructure
src/lib/db.ts           @yatstats
src/lib/firebase.ts     @yatstats
middleware.ts           @yatstats
next.config.ts          @yatstats
```

When a PR modifies a `CODEOWNERS`-protected file, GitHub will automatically request a review from the listed owner(s) before the PR can be merged.

### 4.3 Scope the Copilot agent's permissions

In **Settings → Copilot → Coding agent**:

- Set the **network access policy** to restrict outbound requests to only what the agent needs
- Limit the **GitHub token permissions** the agent receives (read-only on most scopes; write only to `contents` and `pull-requests`)
- Consider enabling **required human review** before the agent can self-merge

### 4.4 Use restricted PATs or fine-grained tokens

If external automation (CI scripts, Vercel webhooks, etc.) needs write access:

- Create a **fine-grained personal access token** scoped to this repo only, with the minimum required permissions
- Rotate tokens regularly and store them in **Repository Secrets**, not directly in workflow files
- Never grant `workflow` or `admin:org` to automated tokens

### 4.5 Enable GitHub Advanced Security alerts on every PR

GitHub Advanced Security is automatically applied to Copilot coding agent PRs (as noted in the PR bodies). To extend this protection to all PRs:

1. Go to **Settings → Security & analysis**
2. Enable **Code scanning** and **Secret scanning**
3. Set "Auto-dismiss alerts" to **off** so every alert must be manually resolved

### 4.6 Tag known-good releases

After each confirmed-good production deployment, create a Git tag:

```bash
git tag -a v$(date +%Y%m%d)-stable -m "Known-good production deployment"
git push origin --tags
```

This makes it trivial to identify the correct rollback target if a rogue commit lands on `main`.

---

## 5. Recovering Safely After Unauthorized Changes

The goal is to **undo the unwanted commits without losing any subsequent authorized work**.

### Option A — Cherry-pick revert (safest, preserves history)

```bash
# 1. Identify the bad commit SHA(s) from the audit above
BAD_SHA=<rogue-commit-sha>

# 2. Create a new branch
git checkout -b fix/revert-rogue-agent main

# 3. Revert the bad commit (creates an inverse commit)
git revert $BAD_SHA --no-edit

# 4. Push and open a PR — do NOT force-push main
git push origin fix/revert-rogue-agent
gh pr create --base main --head fix/revert-rogue-agent \
  --title "Revert unauthorized agent change" \
  --body "Reverts $BAD_SHA — see audit doc for details"
```

### Option B — Hard reset + restore post-rollback work (if cherry-pick is complex)

**Only use this if the rogue commit is at the very tip and there are no authorized commits after it.**

```bash
# 1. Note the last good SHA (use a tag if available)
GOOD_SHA=<last-known-good-sha>

# 2. Reset locally — does NOT push yet
git reset --hard $GOOD_SHA

# 3. Cherry-pick any authorized commits you want to keep
git cherry-pick <authorized-sha-1> <authorized-sha-2> ...

# 4. Push via a PR, not force-push
git push origin HEAD:fix/recover-from-rogue-agent
gh pr create ...
```

> ⚠️ **Never `git push --force` to `main`** — it bypasses branch protection and destroys history, which is exactly what the rogue agent did.

### Option C — Use the GitHub UI revert button

For a single bad PR that was merged:

1. Open the PR on GitHub
2. Scroll to the bottom and click **"Revert"**
3. This creates a new PR reverting only that merge — review and merge it normally

---

## 6. Quick-Reference Checklist

Use this checklist after any unexpected change to `main`:

- [ ] **Who made it?** Check `commit.author.name` and `commit.author.email`
- [ ] **Was it via a PR?** Look for a merge commit; direct pushes bypass review
- [ ] **Was the PR reviewed by a human?** Check `merged_by` and review history
- [ ] **Does the diff match the PR description?** Read the diff carefully
- [ ] **Is there an Actions run for it?** Copilot sessions always produce a workflow run
- [ ] **Are there any open PRs from unknown agents?** Close unrecognised PRs immediately
- [ ] **Is `main` branch protection enabled?** Verify in Settings → Branches
- [ ] **Are there known-good release tags?** Create one now if not

---

*Document created: 2026-03-07 | Author: GitHub Copilot coding agent on behalf of yatstats*
