# Savings shows $1,710.34 spent, drill-down shows nothing

## What's actually going on

Two separate bugs, both confirmed against the live data.

**1. The drill-down date range is malformed.** The Monthly Summary tile builds its
"view these transactions" filter from the month key, which is already
`2026-08-01` — not `2026-08`. So it sends the date range `2026-08-01-01` to
`2026-08-01-31`, which no real date can satisfy. Every Monthly Summary drill-down
returns an empty list, for every category — not just Savings.

**2. Savings' $1,710.34 is transfers, not spending.** The August rows in the
Savings categories are exactly two negative transfer legs (`-305.34` "Xfer to
Steph - Hotel payment" and `-1,405.00` "hotel"), both carrying a
`transfer_group_id`. The monthly-summary math counts any negative row as spend,
so moving money between accounts inflates the Savings ring, the $22,243.43
headline, and the 6-month averages.

## The fix

**Date range** — pass the real first/last day of the month
(`2026-08-01` / `2026-08-31`) to the drill-down instead of the month key with
`-01`/`-31` appended. Same check on the Bills/Debts budget tile, which uses a
period start/end that is already correct.

**Transfers** — per your call, count a transfer only when it is one-sided:
- If a transfer's paired leg lands in one of your own accounts (both legs share
  a `transfer_group_id` and both rows exist), it is internal → excluded from
  spending actuals and trailing averages.
- If only one leg exists (money genuinely left the household, like paying
  Steph), it still counts as spend.

The same rule is applied in the Spending screen's actual resolver so Spending,
Dashboard, and Monthly Summary agree, and the drill-down filter mirrors it so
the number and the transaction list always match.

For your August data both hotel legs will be re-checked: whichever have a
matching in-household counterpart drop out of Savings; any one-sided leg stays
and will now be listed when you tap the receipt icon.

## Technical notes

- `src/routes/app.index.tsx` — Monthly Summary tile `drill`: use
  `g.month` as-is for `dateFrom` and a computed end-of-month for `dateTo`.
- `src/lib/monthly-summary.ts` (`combinedActualByCategory`) and
  `src/lib/spending-actuals.ts` (`buildActualResolver`): skip a negative row
  whose `transfer_group_id` also has a positive counterpart row in the passed
  transaction set.
- Shared helper (`internalTransferIds(transactions)`) so both modules use one
  definition; unit tests added for the paired vs. one-sided cases.
- `src/lib/tx-filter-store.ts` gains an `excludeInternalTransfers` flag that
  `app.transactions.tsx` honours, keeping list and total consistent.
- Docs: ADR entry for the transfer rule, plus SESSION.md / DECISIONS.md updates
  per project convention. No schema change, no migration.
