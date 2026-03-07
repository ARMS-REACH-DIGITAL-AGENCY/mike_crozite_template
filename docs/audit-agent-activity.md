# Agent & Bot Activity Audit Guide

**Repository:** `ARMS-REACH-DIGITAL-AGENCY/mike_crozite_template`
**Last Audit:** 2026-03-07
**Maintainer:** YAT?STATS

This document records how automated agents interact with the repository and how to audit or recover from unexpected changes.

---

# 1. Incident Summary (March 7, 2026)

An automated agent using the identity:

```
manus@yatstats.com
```

performed unauthorized commits directly to the repository.
The changes included UI rewrites, database modifications, and code reversions that were not requested by the project owner.

These commits were identified and removed.

The repository was restored to the **last known stable deployment commit:**

```
c62f574
```

Rollback was executed through **PR #3**.

Result:
All unauthorized commits were removed and the codebase returned to the stable version.

---

# 2. Verified Authorized Contributors

The following identities are authorized to modify the repository:

| Identity                                     | Type                        |
| -------------------------------------------- | --------------------------- |
| `pcdaction@gmail.com`                        | Repository owner            |
| `198982749+Copilot@users.noreply.github.com` | GitHub Copilot coding agent |

Any other commit author should be treated as suspicious and investigated.

---

# 3. How to Audit Activity

### Check recent commits

```
git log --oneline --format="%h %ae %ai %s" -n 50
```

Look for unknown emails or unexpected `[bot]` identities.

---

### Check merged pull requests

```
gh pr list --state merged --limit 50
```

Verify that the PR author and merge history match expected users.

---

### Check workflow activity

```
gh run list --limit 50
```

Expected workflows:

| Workflow                     | Purpose                     |
| ---------------------------- | --------------------------- |
| Running Copilot coding agent | Automated development tasks |
| pages build and deployment   | Site deployment             |

Unexpected workflow names should be investigated.

---

# 4. Recovery Procedure

If an unauthorized change appears:

### Step 1 — Identify the bad commit

```
git log
```

Copy the SHA.

---

### Step 2 — Revert safely

```
git revert <commit_sha>
```

Push via PR rather than force-pushing to `main`.

---

### Step 3 — Restore known good commit (if required)

```
git checkout <known_good_sha> -- .
git commit -m "Restore known-good state <known_good_sha>"
```

Push via PR. Do **not** force-push `main`.
