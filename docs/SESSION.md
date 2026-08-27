## Session Notes

- 2026-08-27 — Phase 11 GitHub Milestone created ("Phase 11 — Ledger
  correctness, money movement, mobile polish", milestone #4) so the
  in-progress phase shows progress. 16 retroactive closed issues (#15–#30),
  one per completed workstream (ADR-055…087), all pointing at
  docs/CHANGELOG.md + docs/CONTEXT.md for detail. Open verification issues
  #4–#8 assigned to it; #9–#10 left unmilestoned (cross-cutting tech-debt).
  Currently 16 closed / 5 open (76%). GitHub-only change, no code.

- 2026-08-27 — Verified (3 Explore agents + live DB): the app never auto-creates
  a balance snapshot (manual "Save snapshot" on Accounts only), and nothing is
  written automatically on a calendar-month rollover — every cycle/arrears/​
  spending figure is derived at render. The only persistent freeze is
  `spending_actuals.is_manual_override` (manual cell edits). Plan approved to
  fix three rough edges the check surfaced (month-rollover-safety plan).

- 2026-08-27 — Fix 3 (copy only): `app.spending.tsx` "Start new month" toast no
  longer says "<month> locked in" ("Now budgeting <next> · earlier months stay
  editable"); override confirm dialog reworded to say the override is that-month-
  only and reversible via the pencil. ADR-041 addendum. No behaviour change.
  Files: src/routes/app.spending.tsx, docs/DECISIONS.md.
