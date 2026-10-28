# YAT?STATS agent operating contract (all agents, all chats)

Production branch: `Easter-NEWS`. This file is authoritative for work on this repository, not any chat's memory.

## Before doing anything
1. Read this file, the current production HEAD, the relevant code, existing tests and active PRs.
2. State the task scope and associated branch/PR. If the user's new request concerns a different area than the branch (e.g. News in a Bracket branch), **stop that branch's work**; ask whether to switch to a new task/branch. Never silently expand scope.
3. For a returning task, locate its previous PR. Compare its merge-base with *current* `Easter-NEWS`; update/rebase/merge production into it before revising or promoting. Resolve semantic conflicts and retest all affected components. A Vercel preview from four days ago is not proof today.
4. One scoped fix per branch/PR; branches start from current `Easter-NEWS`. Avoid one-off school/player overrides. Preserve the universal shared template.

## Before merging
- Inspect the complete diff against **current** production and explain any overlapping changes with merged work since the branch was created.
- Run automated tests, including relevant regression contracts, and verify the latest preview deployment is READY.
- Run actual desktop and mobile feature/behavior checks, including screenshots when CSS changes. Build READY alone is insufficient.
- Check every linked page, sign-in flow and media/OG output impacted by the change.
- Do not report success before the production deployment for the **exact merge SHA** is READY and critical post-deploy checks pass.
- Do not force push, revert someone else's accepted changes, bypass required checks, or merge a failing/stale branch.
- If blocked, report the specific blocker without claiming completion; never promise background work.

## Protected feature contracts
- Imported championship memories remain accessible on the career timeline **and** visible as Stories, including coach Mike Woods (1999–2026).
- Desktop profile Stories displays a distinct sticky sponsor **right column**, not a full-width inline ad; mobile placement can differ.
- Existing signed-in fans can contribute and interact from every entry path, without false sign-in prompts; APIs still verify identity.
- Alumni News Instagram posts use appropriate portrait/image/reel/carousel presentation without unnecessary outbound links.
- Sharing a News story must land on the correct story and generate story-specific OG image/title.
- Splash school-specific sponsor rotation, no restart flash; global shared layout remains universal.
- Bracket scores and advancement are server-sourced; isolated tests must not affect production.

## Definition of done
Code committed, tests passing, preview verified, PR merged, exact production deployment READY, live behavior checked. Every regression fix gains a durable automated test.
