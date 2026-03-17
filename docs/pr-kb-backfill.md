# PR Knowledge-Base Backfill Script

Script: `scripts/backfill-pr-kb.mjs`

This one-time utility fetches GitHub PR history and converts each PR into a single structured row for the Neon KB `documents` table.

## Inputs

- `--repo owner/repo` (required)
- One PR selector (required):
  - `--pr <number>`
  - `--prs <comma,separated,numbers>`
  - `--range <start-end>`

Optional:
- `--output sql|db` (default: `sql`)
- `--out-file <path>` to write SQL statements
- `--table <name>` (default: `documents`)
- `--kb-branch-url <connection-string>` for direct inserts
- `--create-links` to also generate `document_links` statements between related PRs

## Environment Variables

- `GITHUB_TOKEN` (required): token with PR read access to the target repo
- `GITHUB_REPO` (optional): default repo if `--repo` omitted
- `KB_DATABASE_URL` (optional): default for direct DB inserts

## Output Format

Each PR becomes one `documents` row containing:

- `title`
- `summary`
- `action_items` (JSON array)
- `strategic_notes`
- `raw_text`
- `metadata` (JSON)

Metadata includes:

- `pr_number`
- `repo`
- `branch`
- `base_branch`
- `status`
- `decision`
- `decision_reason`
- `commits`
- `pr_url`
- `search_terms`
- `related_prs`
- `deployment_notes` (detected URLs and preview flag)

## Safe Run for PRs 80–90

Preview-only SQL (no writes):

```bash
export GITHUB_TOKEN=... 
node scripts/backfill-pr-kb.mjs \
  --repo yatstats/yatstats \
  --range 80-90 \
  --output sql \
  --out-file ./tmp/kb_pr_80_90.sql \
  --create-links
```

Apply directly to KB branch DB:

```bash
export GITHUB_TOKEN=...
export KB_DATABASE_URL='postgresql://...'
node scripts/backfill-pr-kb.mjs \
  --repo yatstats/yatstats \
  --range 80-90 \
  --output db \
  --create-links
```

