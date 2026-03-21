# YAT?STATS Profile Rebuild Plan

## Current truth
- The school microsite homepage is a section-based experience inside the shared shell.
- The player profile route must live inside the same shell, but only own profile-specific content.
- Global drawers, top navigation, footer, and global search belong to the shell.

## Shell owns
- Global navigation
- Left drawer
- Right/account drawer
- Interaction strip selection mode
- Metadata row
- Footer / partner layer
- Section switching on homepage
- Shared page context

## Homepage owns
- Section content only
- Active alumni cards
- News feed
- All-time content
- Current team content
- Fantasy section
- Mentor section
- Partner section
- About section
- FAQ section

## Player profile page owns
- Player-specific content
- Timeline strip behavior
- Career story sections
- Stats tables
- Game logs
- Profile image behavior

## Player profile page must NOT own
- Global menu drawer logic
- Global account drawer logic
- Global footer
- Global search behavior
- Shell-level navigation behavior

## Live route
- /[hsid]/player/[playerId]/[slug]

## Rebuild sandbox route
- /[hsid]/profile/[playerId]/[slug]

## Current priorities
1. Fix homepage navigation and section consistency
2. Restore interaction strip data feed on homepage
3. Rebuild profile page cleanly in sandbox route
4. Promote rebuilt profile route to live route
5. Revisit NLAT sort/data improvements after shell is stable
