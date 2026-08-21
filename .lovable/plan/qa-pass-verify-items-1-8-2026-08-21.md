# QA pass: verify items 1-8

## Status so far

Task 1 is done and green — full suite run, no failures, no fixes needed:

- `src/lib/arrears.test.ts` — 13/13 pass
- `src/lib/ledger-state.test.ts` — 10/10 pass
- Build: OK

These are the only two test files in the project.

## What I need from you

A throwaway household login (email + password) for the app. I can't mint a
session for a self-managed Supabase project, so items 2-8 stay blocked until
that arrives. Paste it in chat and I'll use it once for sign-in only.

## How items 2-8 get verified

I drive the running preview in a headless browser, sign in with the test
login, and walk each scenario, capturing a screenshot as evidence:

2. Bill detail → Recent Transactions: account icon + name on each row, row tap
   opens the transaction detail dialog.
3. Bills screen → "Stranded bill payments found" contains Beiers; tap Credit
   now; verify it leaves the panel, the past-due badge updates, and the source
   transaction still exists in Recent Transactions.
4. ADR-075: submit + clear a bill payment dated one day past due; verify the
   next cycle renders "Submit payment", not "Reset this cycle".
5. ADR-076: on an item with pre-current-cycle arrears, verify "Log arrears
   payment" appears only there, leaves the current cycle's Submit/Clear state
   untouched, and works twice with different dates/amounts.
6. "Total due" preset on an already-overdue current cycle: preset amount is
   correct and tapping it doesn't error.
7. ADR-077: pencil next to Reverse on a partial cleared payment — edit amount,
   save, totals update; pencil is absent (not erroring) on a transaction that
   already resolved a cycle.
8. ADR-066: pay an advance-type debt to $0, record a new Advance, check it
   reappears un-hidden. Report reproduction either way.

Where a scenario needs data that doesn't exist yet (e.g. an item with prior
arrears, an advance debt at $0), I create it through the app's own UI rather
than writing to the database.

## Fixes

Only genuine regressions get fixed — no redesigns. Each fix is the smallest
change at the layer where the bug lives, then the affected item is re-tested
and the test suite re-run.

## Reporting and docs

- One short pass/fail line per item, 1-8, in chat.
- Each verified or fixed item appended as a bullet to `docs/SESSION.md`
  (what was checked, result, files touched, ADR referenced). Any regression
  found but not fixed also goes to `docs/TODO.md`.
- No git operations on my side; you handle commits.
