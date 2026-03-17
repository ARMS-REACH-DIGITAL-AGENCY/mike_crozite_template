#!/usr/bin/env node

/**
 * Backfill GitHub PR history into the YAT?STATS Neon knowledge-base documents table.
 *
 * Usage examples:
 *   node scripts/backfill-pr-kb.mjs --repo yatstats/yatstats --pr 80 --output sql
 *   node scripts/backfill-pr-kb.mjs --repo yatstats/yatstats --prs 80,82,84 --output sql --out-file ./tmp/pr-backfill.sql
 *   node scripts/backfill-pr-kb.mjs --repo yatstats/yatstats --range 80-90 --output db --kb-branch-url "$KB_DATABASE_URL"
 */

import { writeFile } from 'node:fs/promises';
import process from 'node:process';

const GITHUB_API_BASE = 'https://api.github.com';

function parseArgs(argv) {
  const args = {
    output: 'sql',
    table: 'documents',
    repo: process.env.GITHUB_REPO || '',
    branch: process.env.KB_BRANCH || 'knowledge-base',
    baseBranchHint: process.env.KB_BASE_BRANCH || 'main',
    createLinks: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--repo') {
      args.repo = next;
      i++;
    } else if (arg === '--pr') {
      args.pr = next;
      i++;
    } else if (arg === '--prs') {
      args.prs = next;
      i++;
    } else if (arg === '--range') {
      args.range = next;
      i++;
    } else if (arg === '--output') {
      args.output = next;
      i++;
    } else if (arg === '--out-file') {
      args.outFile = next;
      i++;
    } else if (arg === '--table') {
      args.table = next;
      i++;
    } else if (arg === '--kb-branch-url') {
      args.kbBranchUrl = next;
      i++;
    } else if (arg === '--branch') {
      args.branch = next;
      i++;
    } else if (arg === '--base-branch') {
      args.baseBranchHint = next;
      i++;
    }
    else if (arg === '--create-links') args.createLinks = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }

  return args;
}

function usage() {
  return `\nbackfill-pr-kb.mjs\n\nRequired:\n  --repo owner/repo\n  One of: --pr <n> | --prs <n,n,n> | --range <start-end>\n\nOptional:\n  --output sql|db           (default: sql)\n  --out-file <path>         write SQL output to file\n  --table <name>            documents table name (default: documents)\n  --kb-branch-url <url>     Neon KB branch connection string (required when --output db)\n  --branch <name>           metadata branch hint (default: knowledge-base)\n  --base-branch <name>      metadata base branch hint (default: main)\n  --create-links            also emit/insert document_links rows when related PRs exist\n\nEnv vars:\n  GITHUB_TOKEN              required for GitHub API\n  GITHUB_REPO               optional default for --repo\n  KB_DATABASE_URL           optional default for --kb-branch-url\n`;
}

function parsePrNumbers(args) {
  const set = new Set();

  if (args.pr) set.add(Number(args.pr));

  if (args.prs) {
    for (const part of args.prs.split(',')) {
      const n = Number(part.trim());
      if (Number.isInteger(n) && n > 0) set.add(n);
    }
  }

  if (args.range) {
    const m = args.range.match(/^(\d+)-(\d+)$/);
    if (!m) throw new Error(`Invalid --range value: ${args.range}`);
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (end < start) throw new Error(`Invalid --range (end < start): ${args.range}`);
    for (let n = start; n <= end; n++) set.add(n);
  }

  const prNumbers = [...set].sort((a, b) => a - b);
  if (prNumbers.length === 0) throw new Error('No PR numbers provided. Use --pr, --prs, or --range.');
  return prNumbers;
}

async function ghFetch(path, token) {
  const res = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'yatstats-kb-backfill-script',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status} for ${path}: ${body}`);
  }

  return res.json();
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function inferDecision(pr) {
  if (pr.merged_at) {
    return {
      decision: 'accepted',
      decision_reason: `Merged into ${pr.base?.ref || 'base branch'} on ${pr.merged_at}`,
      status: 'merged',
    };
  }

  if (pr.state === 'closed') {
    return {
      decision: 'not_accepted',
      decision_reason: 'PR was closed without merge',
      status: 'closed',
    };
  }

  return {
    decision: 'pending',
    decision_reason: 'PR still open at time of backfill',
    status: 'open',
  };
}

function extractActionItems(text) {
  const lines = (text || '').split('\n');
  return lines
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+\[\s\]\s+/i.test(l) || /^todo[:\s]/i.test(l))
    .map((l) => l.replace(/^[-*]\s+\[\s\]\s+/i, '').replace(/^todo[:\s]*/i, '').trim())
    .slice(0, 12);
}

function extractRelatedPrs(...texts) {
  const related = new Set();
  for (const t of texts) {
    const matches = String(t || '').match(/#(\d{1,6})/g) || [];
    for (const match of matches) related.add(Number(match.slice(1)));
  }
  return [...related].sort((a, b) => a - b);
}

function findUrls(text) {
  return (String(text || '').match(/https?:\/\/[^\s)\]]+/g) || []).map((u) => u.replace(/[.,;]$/, ''));
}

function buildDocument({ repo, pr, issueComments, reviewComments, commits, files, args }) {
  const combinedComments = [
    ...issueComments.map((c) => c.body || ''),
    ...reviewComments.map((c) => c.body || ''),
  ].join('\n\n');

  const decisionInfo = inferDecision(pr);
  const deploymentUrls = findUrls(`${pr.body || ''}\n${combinedComments}`).filter((u) =>
    /(vercel|netlify|onrender|render\.com|railway|preview|deploy|staging)/i.test(u)
  );

  const changedFiles = files.map((f) => f.filename).slice(0, 50);
  const actionItems = extractActionItems(`${pr.body || ''}\n${combinedComments}`);
  const relatedPrs = extractRelatedPrs(pr.body, combinedComments).filter((n) => n !== pr.number);

  const summary = [
    `PR #${pr.number} in ${repo}: ${pr.title}`,
    pr.body ? `Body length ${pr.body.length} chars.` : 'No PR body provided.',
    `${commits.length} commit(s), ${files.length} file(s) touched, ${issueComments.length} issue comment(s), ${reviewComments.length} review comment(s).`,
  ].join(' ');

  const strategicNotes = [
    `Head branch ${pr.head?.ref || 'unknown'} -> base ${pr.base?.ref || args.baseBranchHint}.`,
    decisionInfo.decision_reason,
    deploymentUrls.length ? `Deployment references captured (${deploymentUrls.length}).` : 'No explicit deployment references found.',
  ].join(' ');

  const rawTextSections = [
    `PR TITLE\n${pr.title}`,
    `PR URL\n${pr.html_url}`,
    `PR BODY\n${pr.body || '(empty)'}`,
    `COMMITS\n${commits.map((c) => `- ${c.sha.slice(0, 7)} ${c.commit?.message || ''}`).join('\n') || '(none)'}`,
    `FILES\n${changedFiles.map((f) => `- ${f}`).join('\n') || '(none)'}`,
    `ISSUE COMMENTS\n${issueComments.map((c) => `- ${c.user?.login || 'unknown'}: ${(c.body || '').replace(/\n/g, ' ')}`).join('\n') || '(none)'}`,
    `REVIEW COMMENTS\n${reviewComments.map((c) => `- ${c.user?.login || 'unknown'}: ${(c.body || '').replace(/\n/g, ' ')}`).join('\n') || '(none)'}`,
  ];

  const metadata = {
    pr_number: pr.number,
    repo,
    branch: pr.head?.ref || args.branch,
    base_branch: pr.base?.ref || args.baseBranchHint,
    status: decisionInfo.status,
    decision: decisionInfo.decision,
    decision_reason: decisionInfo.decision_reason,
    commits: commits.map((c) => ({ sha: c.sha, message: c.commit?.message || '' })),
    pr_url: pr.html_url,
    search_terms: [
      `pr-${pr.number}`,
      pr.title,
      pr.head?.ref,
      pr.base?.ref,
      ...(pr.labels || []).map((l) => l.name),
    ].filter(Boolean),
    related_prs: relatedPrs,
    deployment_notes: {
      urls: deploymentUrls,
      has_preview: deploymentUrls.length > 0,
    },
    stats: {
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      comments: pr.comments,
      review_comments: pr.review_comments,
    },
  };

  return {
    title: `GitHub PR #${pr.number}: ${pr.title}`,
    summary,
    action_items: actionItems,
    strategic_notes: strategicNotes,
    raw_text: rawTextSections.join('\n\n'),
    metadata,
  };
}

function buildInsertSql(table, doc) {
  return `INSERT INTO ${table} (title, summary, action_items, strategic_notes, raw_text, metadata) VALUES (${sqlString(doc.title)}, ${sqlString(doc.summary)}, ${sqlString(JSON.stringify(doc.action_items))}::jsonb, ${sqlString(doc.strategic_notes)}, ${sqlString(doc.raw_text)}, ${sqlString(JSON.stringify(doc.metadata))}::jsonb);`;
}

function buildDocumentLinksSql(docsByPr, table = 'document_links') {
  const sql = [];
  for (const [prNumber, doc] of docsByPr.entries()) {
    const related = doc.metadata.related_prs || [];
    for (const other of related) {
      if (!docsByPr.has(other)) continue;
      sql.push(`INSERT INTO ${table} (from_document_id, to_document_id, link_type, metadata)
SELECT d1.id, d2.id, 'related_pr', ${sqlString(JSON.stringify({ via: `#${other}`, source_pr: prNumber }))}::jsonb
FROM documents d1, documents d2
WHERE d1.metadata->>'pr_number' = ${sqlString(String(prNumber))}
  AND d2.metadata->>'pr_number' = ${sqlString(String(other))};`);
    }
  }
  return sql;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  if (!args.repo || !args.repo.includes('/')) {
    throw new Error('Missing --repo owner/repo');
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Missing GITHUB_TOKEN environment variable');

  const prNumbers = parsePrNumbers(args);
  const [owner, repoName] = args.repo.split('/');
  const docsByPr = new Map();

  for (const prNumber of prNumbers) {
    console.log(`Fetching PR #${prNumber}...`);

    const [pr, issueComments, reviewComments, commits, files] = await Promise.all([
      ghFetch(`/repos/${owner}/${repoName}/pulls/${prNumber}`, token),
      ghFetch(`/repos/${owner}/${repoName}/issues/${prNumber}/comments?per_page=100`, token),
      ghFetch(`/repos/${owner}/${repoName}/pulls/${prNumber}/comments?per_page=100`, token),
      ghFetch(`/repos/${owner}/${repoName}/pulls/${prNumber}/commits?per_page=100`, token),
      ghFetch(`/repos/${owner}/${repoName}/pulls/${prNumber}/files?per_page=100`, token),
    ]);

    const doc = buildDocument({
      repo: args.repo,
      pr,
      issueComments,
      reviewComments,
      commits,
      files,
      args,
    });

    docsByPr.set(prNumber, doc);
  }

  const docs = [...docsByPr.values()];

  if (args.output === 'sql') {
    const sql = docs.map((d) => buildInsertSql(args.table, d));
    if (args.createLinks) sql.push(...buildDocumentLinksSql(docsByPr));
    const finalSql = sql.join('\n\n') + '\n';

    if (args.outFile) {
      await writeFile(args.outFile, finalSql, 'utf8');
      console.log(`Wrote ${docs.length} INSERT statements to ${args.outFile}`);
    } else {
      console.log(finalSql);
    }
  } else if (args.output === 'db') {
    const conn = args.kbBranchUrl || process.env.KB_DATABASE_URL;
    if (!conn) throw new Error('Missing KB DB URL. Use --kb-branch-url or KB_DATABASE_URL env var.');

    const { Client } = await import('pg');
    const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

    await client.connect();
    try {
      for (const d of docs) {
        await client.query(
          `INSERT INTO ${args.table} (title, summary, action_items, strategic_notes, raw_text, metadata)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb)`,
          [d.title, d.summary, JSON.stringify(d.action_items), d.strategic_notes, d.raw_text, JSON.stringify(d.metadata)]
        );
      }

      if (args.createLinks) {
        const linksSql = buildDocumentLinksSql(docsByPr);
        for (const statement of linksSql) {
          await client.query(statement);
        }
      }

      console.log(`Inserted ${docs.length} row(s) into ${args.table}`);
    } finally {
      await client.end();
    }
  } else {
    throw new Error(`Unsupported --output: ${args.output}`);
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
