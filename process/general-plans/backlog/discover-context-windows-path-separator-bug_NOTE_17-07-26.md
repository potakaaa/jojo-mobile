---
name: note:discover-context-windows-path-separator-bug
description: "discover-context.mjs --emit-routing/--check-routing use forward-slash regexes against Windows backslash paths, detecting zero context groups and silently deleting the routing table's group rows when run on Windows"
date: 17-07-26
feature: general
---

# Backlog: `discover-context.mjs --emit-routing` corrupts the routing block on Windows

**Status:** accepted harness bug, found and worked around during MENU-003/MENU-004 UPDATE
PROCESS (17-07-26). Damage was caught and reverted the same session; script itself is unfixed.

## TL;DR

Running `node .claude/skills/vc-context-discovery/scripts/discover-context.mjs --emit-routing`
on this Windows checkout wiped both `tests/` and `planning/` group rows from
`process/context/all-context.md`'s `<!-- GENERATED:routing -->` block (replaced with `(no
groups yet — populated during STUDY phase...)`), and dropped `all-planning.md`/`all-tests.md`
from the "Current Root Entry Points" table too — because the script's group-detection helpers
use forward-slash-only regexes against paths built with `path.join()`, which produces
backslashes on Windows.

## Root cause (`.claude/skills/vc-context-discovery/scripts/discover-context.mjs`)

- `walk()` builds relative paths via `path.join(dir, entry.name)` — on Windows this yields
  `process\context\tests\all-tests.md` (backslash-separated).
- `groupOf(relPath)` does `relPath.replace(/^process\/context\//, "")` — a **forward-slash**
  regex. Against a backslash path this never matches, so `rest` stays the full path and
  `.split(path.sep)` (correctly backslash-aware) yields `parts[0] === "process"`, not the group
  name — so every file is treated as ungrouped.
- `groupEntrypoints()` additionally filters with `/(^|\/)all-[^/]+\.md$/.test(d.path)` — another
  forward-slash-only regex against a backslash path, which also never matches on Windows.
- Net effect: `groupEntrypoints()` always returns `[]` on Windows, so `--emit-routing` writes
  `(no groups yet...)` regardless of how many real groups exist, and `--check-routing` always
  reports the routing block as "stale" (since the real block, correctly authored, will never
  match the buggy empty-groups output).

## Impact this session

- `node .claude/skills/vc-context-discovery/scripts/discover-context.mjs --emit-routing` was run
  once during this UPDATE PROCESS pass (attempting to clear a "stale" warning after editing
  `tests/all-tests.md`'s frontmatter `date` field) and it deleted the `tests/`/`planning/` group
  rows plus 2 of 3 "Current Root Entry Points" rows. Caught via `git diff` review before
  committing and manually reverted in the same pass — no data was actually lost, but a future
  agent trusting `--emit-routing`'s "success" output on Windows would silently corrupt
  `all-context.md`.
- `--check-routing` now permanently reports STALE on this Windows checkout even when the routing
  block is correct and complete — this is an accepted false-positive until the bug is fixed, not
  a signal that the block actually needs regenerating.

## Same bug class also affects `vc-audit-context`'s validator (confirmed 17-07-26)

`node .claude/skills/vc-audit-context/scripts/validate-context-discovery.mjs` shares the same
forward-slash-only regex pattern (e.g. `doc.replace(/^process\/context\//, "")` at line ~177) and
produces analogous FALSE-POSITIVE failures on Windows: `"process\context\all-context.md is not
indexed by process/context/all-context.md or its group entrypoint"` for all 3 context docs
(including `all-context.md` itself), plus false "empty/missing keywords" warnings even when
`keywords:` frontmatter is present and non-empty. Manually verified during this session that the
routing table DOES list all 3 files and `all-tests.md`'s `keywords:` field IS populated — these
are validator false positives from the path-separator bug, not real content problems. Treat any
`validate-context-discovery.mjs` "not indexed" / "missing keywords" failure on Windows as
suspect until the path-normalization fix below is applied; verify manually by reading the file
instead of trusting the validator output.

## Suggested fix (not yet applied)

Use `path.sep`-aware splitting everywhere instead of forward-slash regexes, or normalize all
paths to forward slashes immediately after `walk()` (e.g. `relPath.split(path.sep).join("/")`)
before any regex/string-prefix logic runs. Apply the same normalization to both `groupOf()` and
the `all-[^/]+\.md$` test in `groupEntrypoints()`.

## Guidance for future agents (until fixed)

- Do NOT run `discover-context.mjs --emit-routing` on a Windows checkout without diffing the
  result before accepting it — it will likely wipe real group rows.
- If `--check-routing` reports STALE, verify manually (read the block, compare against known
  groups) before assuming the block is actually wrong — on Windows this check is currently
  unreliable.

## References

- Script: `.claude/skills/vc-context-discovery/scripts/discover-context.mjs`
  (`groupOf`, `groupEntrypoints`, `buildRoutingBlock`)
- Discovered during: MENU-003/MENU-004 UPDATE PROCESS pass, 17-07-26.
