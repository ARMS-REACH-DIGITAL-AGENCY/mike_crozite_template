# PR Knowledge-Base Backfill Script

Script: `scripts/backfill-pr-kb.mjs`

This one-time utility fetches GitHub PR history and converts each PR into a single structured row for the Neon KB `documents` table.

**Scope (v1):** This script populates the `documents` table only. It does **not** populate `document_chunks`. Chunk-level embeddings are deferred and must be handled separately if required.

## Inputs

- `--repo owner/repo` (required) — use `ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template`
- One PR selector (required):
  - `--pr <number>`
  - `--prs <comma,separated,numbers>`
  - `--range <start-end>`

Optional:
- `--output sql|db` (default: `sql`)
- `--out-file <path>` to write SQL statements
- `--table <name>` (default: `documents`)
- `--kb-branch-url <connection-string>` for direct inserts (KB branch only, not the stats DB)
- `--create-links` to also generate `document_links` statements between related PRs

## Environment Variables

- `GITHUB_TOKEN` (required): token with PR read access to the target repo
- `GITHUB_REPO` (optional): default repo if `--repo` omitted
- `KB_DATABASE_URL` (required for `--output db`): Neon KB branch connection string — **use this, not `DATABASE_URL`** (which is the stats DB)

## Output Format

Each PR becomes one `documents` row. The script populates the following columns:

| Column | Value |
|---|---|
| `title` | `GitHub PR #<n>: <PR title>` |
| `source_type` | `'github_pr'` |
| `source_name` | repo slug (e.g. `ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template`) |
| `doc_type` | `'pull_request'` |
| `category` | `'development'` |
| `status` | PR state: `open`, `closed`, or `merged` |
| `doc_date` | merge date if merged, otherwise PR creation date |
| `cleaned_text` | PR title + body, HTML comments stripped |
| `summary` | one-line narrative summary |
| `action_items` | JSON array of unchecked checkboxes / TODO items from body/comments |
| `strategic_notes` | head→base branch, decision reason, deployment URL summary |
| `raw_text` | full dump: title, body, commits, files, issue comments, review comments |
| `metadata` | JSON: `pr_number`, `repo`, `branch`, `base_branch`, `status`, `decision`, `decision_reason`, `commits`, `pr_url`, `search_terms`, `related_prs`, `deployment_notes`, `stats` |

## Duplicate Prevention (Idempotency)

The script is safe to run multiple times for the same PR.

- **SQL mode**: each INSERT is wrapped in `WHERE NOT EXISTS (SELECT 1 FROM documents WHERE metadata->>'pr_number' = '...' AND metadata->>'repo' = '...')`. If the row already exists, the INSERT is a no-op.
- **DB mode**: a `SELECT` check is performed before each insert. If the document already exists, the PR is skipped and a message is logged.

No unique index on `documents` is assumed. The check relies on `metadata->>'pr_number'` and `metadata->>'repo'` which are always populated.

## `document_links` Schema Assumptions

When `--create-links` is used, the script emits INSERT statements for `document_links` based on the following assumed column set:

| Column | Type |
|---|---|
| `id` | serial PK |
| `from_document_id` | int, FK → `documents.id` |
| `to_document_id` | int, FK → `documents.id` |
| `link_type` | text (e.g. `'related_pr'`) |
| `metadata` | jsonb |

Links are created only when **both** PRs in the related pair are present in the current batch. Link inserts are also idempotent — a link is skipped if an identical `(from_document_id, to_document_id, link_type)` row already exists.

If your actual `document_links` schema differs from the above, adjust the column list in `buildDocumentLinksSql` before running.

## Safe Run for PRs 80–90

Preview-only SQL (no writes):

```bash
export GITHUB_TOKEN=...
node scripts/backfill-pr-kb.mjs \
  --repo ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template \
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
  --repo ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template \
  --range 80-90 \
  --output db \
  --create-links
```

Both SQL and DB modes are fully supported. SQL mode is recommended for auditing before writes.

