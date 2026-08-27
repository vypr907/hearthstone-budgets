# TODO

Actionable open work is tracked in **GitHub Issues**, not here (ADR-087):

- Things needing a browser/device check → label `verification`
- Cleanup / backfills / formatting → label `tech-debt`
- Phase progress → **Milestones** (`Phase 12 …`, `Phase 13 …`, `Phase 14 …`)
- `gh issue list` / the repo's Issues tab

This file now holds only **known limitations that are working as designed** —
not tasks:

- **Accounts vs. Institutions detail dialogs stay screen-specific.** Investigated
  2026-08-11; they share too little at the detail level (institution → linked
  accounts/bills/debts; account → recent transactions) to warrant a shared
  component. Only the add/edit *forms* are shared.
- **Payment Schedule past months show no per-debt breakdown.** By design —
  balances have moved on, so a past month is history (check-off only), not a
  simulation. Ledger status badges appear on the current month only.
- **No guard against two Set Aside entries for the same bill in one month** was
  the state before 2026-08-26; now resolved as *warn-and-allow* (ADR-038
  addendum). Kept here as a pointer.
- **Monthly-debt arrears recover at most ONE missed prior month** (ADR-049
  addendum, `arrearsWalkStart`). A monthly debt's `due_day` is recomputed inside
  the current calendar month with no history, so `computeArrears` can only infer
  a single just-missed prior cycle from the row's current state. A debt two or
  more months behind under-reports until each due day passes. A full fix needs
  `computeArrears` to read the linked transaction ledger — a larger signature
  change, deferred as its own task.
