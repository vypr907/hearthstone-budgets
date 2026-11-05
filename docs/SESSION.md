# SESSION.md

## Session Notes

- Split `docs/DECISIONS.md` (116 ADRs, 6011 lines) into one file per ADR
  under `docs/adr/ADR-<xxx>-<kebab-title>.md`, with `docs/DECISIONS.md`
  rewritten as a flat ID | Title | Status | Date index. Verified zero
  content loss (concatenated `docs/adr/*.md` diffed clean against the
  original). Repointed all repo references to `DECISIONS.md` (living docs:
  CLAUDE.md, README.md, new-adr.md, scripts, .kiro/steering; historical:
  docs/CHANGELOG.md, .lovable/plan/*.md) to the specific new ADR paths.
  Added ADR-117 documenting the change itself. Branch: `docs/adr-split`.
  ADR: 117. Next: user reviews `git diff --stat` and commits.
