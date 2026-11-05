## ADR-117: Split DECISIONS.md into Per-ADR Files Under docs/adr/

Decision:
`docs/DECISIONS.md` is now a slim index (ID | Title | Status | Date table,
one row per ADR, linked to its own file). Each ADR's full body (unchanged,
byte-for-byte from the original monolithic file) lives at
`docs/adr/ADR-<xxx>-<kebab-title>.md`. ADR IDs and numbering are unchanged
— no renumbering. New ADRs are drafted as a new file under `docs/adr/` plus
a new index row, not appended to a monolith. `scripts/split_adrs.py`
performed the one-time migration and is kept for reference.

Reason:
`docs/DECISIONS.md` had grown to 116 ADRs / 6000+ lines and is read in full
by every agent session per the doc hierarchy in CLAUDE.md, costing context
budget even when only one or two ADRs are relevant to the task at hand.
Splitting into per-ADR files lets a session read the index, then open only
the specific files it needs.

Status: Decided 2026-11-05. Implemented 2026-11-05 — all 116 prior ADRs
split verbatim into `docs/adr/`, `docs/DECISIONS.md` rewritten as the
index, `CLAUDE.md` and `.claude/commands/new-adr.md` updated for the new
workflow, and references across the repo (README.md, scripts, docs/,
docs/CHANGELOG.md, .lovable/plan/*.md) repointed to the new per-ADR paths.
