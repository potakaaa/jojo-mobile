---
name: note:crlf-line-ending-format-check-drift
description: "core.autocrlf=true on Windows checkouts rewrites LF->CRLF, breaking pnpm format:check repo-wide and making git status misleading"
date: 17-07-26
feature: general
---

# Backlog: CRLF line-ending drift breaks `format:check` and misleads `git status`

**Status:** accepted/deferred harness debt. Not a defect in any feature branch — a Windows
checkout config issue observed repeatedly during MENU-003/MENU-004 (17-07-26).

## TL;DR

On this Windows checkout, `core.autocrlf=true` rewrites LF -> CRLF on checkout for ~131
mostly-untouched files. This breaks `pnpm format:check` repo-wide (CRLF fails Prettier under
this repo's config) AND makes `git status` misleading (it reports ~128 "modified" files when
only ~8-12 actually have real content diffs). CI on Linux is unaffected — this is Windows-local.

## Evidence (independently confirmed 3x this session)

- `pnpm format:check` fails on ~131 files across the repo, most of which were never touched
  this session.
- Confirmed independently by `vc-execute-agent`, `vc-tester`, and again at commit time: content
  is clean — running the same files through Prettier with CR characters stripped passes under
  the real repo Prettier config. Only the line-ending byte (`\r\n` vs `\n`) fails the check.
- `git status` reports ~128 modified files; `git diff -w --numstat` (or `--ignore-cr-at-eol`)
  is the only reliable way to see which files have REAL content changes on this checkout. Agents
  that read plain `git status` on this box will misjudge blast radius.

## Why this matters

- Repeatedly misled multiple agents into over-scoping "what changed" this session, because raw
  `git status` output does not distinguish CRLF-only rewrites from real edits.
- Collides directly with this repo's own commit rule: `CLAUDE.md` §Commit Hygiene requires
  running `pnpm format:check` (and fixing any Prettier issues) before committing. Running
  `prettier --write` to "fix" this would rewrite all ~131 untouched files in every commit,
  polluting diffs and defeating the point of the check. This rule was deliberately set aside
  twice this session (MENU-003, MENU-004) with the user's knowledge for exactly this reason.

## Suggested direction (not a decision — pick one)

1. Set `endOfLine: "auto"` in the repo's Prettier config (`packages/config` or root
   `.prettierrc`) so Prettier accepts the platform's native line ending instead of forcing LF.
2. Add a `.gitattributes` with `* text=auto eol=lf` (or equivalent) so git normalizes line
   endings consistently regardless of `core.autocrlf`, removing the drift at the source.
3. Document a one-time fix-up: `git config core.autocrlf input` (or `false`) for Windows
   contributors, plus a one-time repo-wide `prettier --write` + commit to normalize existing
   files — coordinate timing so it doesn't collide with in-flight branches.

## Diagnostic for future agents hitting this

```sh
git diff -w --numstat        # or: git diff --ignore-cr-at-eol --numstat
```
This is the reliable way to separate real content diffs from CRLF-only rewrites on this
checkout. Do not trust plain `git status`/`git diff --numstat` counts here.

## References

- Observed during: `process/features/ordering-cart/active/menu-003-branch-availability_17-07-26/`
  and `process/features/ordering-cart/active/menu-004-category-filter-polish_17-07-26/` EXECUTE
  and EVL passes.
- Related rule: `CLAUDE.md` §Commit Hygiene (`pnpm format:check` before commit).
