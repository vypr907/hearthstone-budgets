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

- 2026-08-27 — SCRATCHPAD "Things to work on" #3 (Advance debt bug) + #2
  (account/card number). ADR-056 addendum + ADR-021 addendum. No schema change.
  Browser-verified against the TEST household (login via `.env.test`, all test
  rows cleaned up); tsc + build + 96 tests green.
  #3 — `src/routes/app.debts.tsx` `DebtDialog`:
    * advance-type debts show **Remaining balance** + **Minimum payment**
      disabled with helper text; on create they seed 0/0, on edit the form
      omits `remaining_balance` / `minimum_payment` / `date_paid_off` from the
      UPDATE entirely — a stale detail snapshot can no longer clobber a live
      draw (the actual data-loss path on "Dave ExtraCash").
    * `isPaidOff()` now treats an advance as paid off only when `date_paid_off`
      is set (advances sit at $0 between draws); other debt types unchanged.
    * creating any debt with no starting AND no remaining balance no longer
      stamps `date_paid_off`.
    * blank interest rate / minimum payment now write `0` not `null` — both
      columns are NOT NULL, so a no-rate debt never saved before (pre-existing
      bug surfaced while testing the advance flow).
  #2 — "Account / card number" field added to `AccountDialog` bound to the
    existing `accounts.account_number` column; `src/routes/app.accounts.tsx`
    shows `···1234` after the account name; pickers/pills already used
    `accountLast4`/`accountLabel`.
  Files: src/routes/app.debts.tsx, src/components/AccountDialog.tsx,
  src/routes/app.accounts.tsx, docs/DECISIONS.md, docs/SCHEMA.md,
  docs/SCRATCHPAD.md. Issues: #37 (advance bug), #36 (ownership follow-up).
  - Known follow-up: SCRATCHPAD #1 / Issue #36 (account ownership "mine vs
    hers", exclude other member's accounts from spendable + net worth) —
    designed in the plan, not built. Needs new ADR-088 +
    `accounts.owner_member_id` migration.
  - Manual data fix pending (Steven, "Our Household"): restore "Dave ExtraCash"
    (`da042cbb-…`) to `remaining_balance`/`minimum_payment` = 50, `date_paid_off`
    = null. SQL in Issue #37 / the plan file.
  - Known cosmetic (not fixed): the debt-detail panel still shows an empty $0
    advance's cycle as "Cleared" (ADR-036/085 ledger-derived state); harmless,
    resolves once a draw is recorded.

- 2026-08-27 — SCRATCHPAD #1 / Issue #36: account ownership "mine vs hers"
  (ADR-088). Code written; **migration not yet run**, so not browser-tested.
    * `accounts.owner_member_id uuid null → household_members(id)` — null =
      joint. Also wires the pre-existing unused `accounts.include_in_net_worth`.
    * New `src/lib/household.ts`: `useHouseholdMembers()` + `useCurrentMember()`
      (mirrors `useMemberTheme`). New `accountInMemberView()` in `balances.ts`.
    * `AccountDialog`: "Belongs to" select (Joint / each member) + "Include in
      net worth" checkbox.
    * Scoped per-viewer: dashboard combined spendable + breakdown
      (`app.index.tsx`), net-worth total + trend (`net-worth.ts` also honors
      `include_in_net_worth`), Status Snapshot balance subtotals
      (`app.snapshot.tsx`). Ledger / per-account cards / institution totals
      unchanged.
    * Accounts screen: owner chip on each card + an "Owner" filter.
    * `docs/SCHEMA.md` "Never Add" rule amended.
  Files: src/lib/supabase.ts, src/lib/household.ts (new), src/lib/balances.ts,
  src/lib/net-worth.ts, src/components/AccountDialog.tsx, src/routes/app.index.tsx,
  src/routes/app.snapshot.tsx, src/routes/app.accounts.tsx, docs/*.
  - Migration run by Steven. Browser-verified in the TEST household (dashboard /
    accounts / snapshot load clean, "Belongs to" hidden for a 1-member
    household, "Include in net worth" round-trips). Owner-scoping (2-member)
    path covered by `src/lib/balances.test.ts` (5 new tests, 101 total).
    "Belongs to" marks the signed-in member "(me)". PR #39, Closes #36.
    Live 2-member check happens when it reaches "Our Household".
