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
  fix three rough edges the check surfaced.

- 2026-08-27 — Fix 3 (PR): `app.spending.tsx` "Start new month" toast no longer
  says "<month> locked in" ("Now budgeting <next> · earlier months stay
  editable"); override confirm dialog reworded to say the override is that-month-
  only and reversible. ADR-041 addendum. Copy only.

- 2026-08-27 — Fix 2 (PR): Dashboard "Past due" + `PastDueBadge` now use new
  `priorArrearsSummary()` (arrears from cycles before the current calendar month
  only) instead of `computeArrears().amountOverdue` — the current cycle also
  shows under "Still owed this period" (ADR-080), so counting it in both
  double-counted (up to ~2–3× for an item a month behind). `computeArrears`
  itself unchanged (still the payoff/repair figure + all payment math). Also
  added `arrearsWalkStart()`: a monthly debt's missed prior-month cycle no longer
  silently vanishes from arrears (one-month lookback; deeper misses need the
  ledger — docs/TODO.md). ADR-049 addendum + ADR-080 note. 94 tests (88 + 6).
  Files: src/lib/arrears.ts, src/components/PastDueBadge.tsx,
  src/routes/app.index.tsx, src/lib/arrears.test.ts, docs/*.

- 2026-08-27 — Fix 1 (PR, stacked on Fix 2): historical-month cycle inspection.
  `useCycleState(refDate?)` (default = today, all call sites unchanged). Shared
  `CycleMonthStepper` on Bills + Debts detail (monthly items only; non-monthly
  get a muted "not available" line). Stepping to a past month re-derives the
  panel's cycle state / window / month-scoped transaction list; `refDate ≠ today`
  hides Sync-stored-status, PayActions/ArrearsPaymentAction/SetAsideAction
  (replaced with a Correct/Reverse pointer), keeps Log-a-payment / adjustments /
  per-tx actions. **Bills detail brought to ADR-085 parity** (was showing raw
  `payment_status`; now derives, with a `stored:` line). Added a right-now
  "Still owed / Past due / Total owed" rollup to both panels. `monthLabel` +
  `formatWindow` lifted to `src/lib/format.ts` (3 local copies removed).
  ADR-085 addendum. Browser-verified (login via `.env.test`, both panels, month
  step, gating, non-monthly). tsc + build + 96 tests (94 + 2 new).
  Files: src/lib/ledger-state.ts, src/lib/format.ts,
  src/components/CycleMonthStepper.tsx, src/routes/app.debts.tsx,
  src/routes/app.bills.tsx, src/routes/app.spending.tsx,
  src/routes/app.spending-by-place.tsx, src/lib/ledger-state.test.ts, docs/*.
