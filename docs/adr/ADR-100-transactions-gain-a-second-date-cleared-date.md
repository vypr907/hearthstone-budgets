## ADR-100: Transactions Gain a Second Date — cleared_date

Decision:
Add `transactions.cleared_date date` (nullable). `transaction_date` keeps its
existing meaning — when the transaction was logged/initiated/submitted — and is
never auto-changed by a later status transition. `cleared_date` is the date it
actually posted at the bank, matching what a bank statement would show:

- Set automatically equal to the entered date whenever a row is written
  directly with `status: 'cleared'` (manual cleared entries, transfers,
  splits, reversals, corrections, historical logged payments) — no extra
  prompt, since there's only one real date in play.
- Explicitly prompted for (defaulting to **today**, editable) specifically at
  the **pending → cleared transition** — the one moment "today" is genuinely
  different information from the row's original `transaction_date`.

Every existing `cleared` row is backfilled (`cleared_date = transaction_date`)
by the same migration that adds the column, so the field is reliably non-null
for every cleared row going forward.

`src/lib/balances.ts` (`computeBalances`) and `src/lib/net-worth.ts`
(`balanceAsOf`) both switch their anchor-date comparison for cleared
transactions from `transaction_date` to `cleared_date` (defensive `??
transaction_date` fallback kept, not expected to be load-bearing post-backfill).
Pending transactions are unaffected — they have no `cleared_date` by
definition and stay compared on `transaction_date`, their only meaningful date.

The pending→cleared UI surfaces gained a "Cleared date" input:
- `src/lib/pay-flow.tsx`'s `tap()` — clearing an already-pending bill/debt
  payment (the main checkbox tap on Bills/Debts/Everything) was previously
  instant with no dialog at all; it now shows a small confirm dialog with just
  the date (defaulting to today) before clearing, for both the known-account
  path and the unknown-account/picker fallback.
- `src/routes/app.pending.tsx`'s existing "Mark cleared?" confirm dialog
  gained the same date input inline — no new dialog needed there, it already
  stopped for confirmation.
- `TransactionDetail`/`SplitTransactionDetail`/`LinkedGroupDetail`
  (`app.transactions.tsx`) each gained a "Cleared date" field next to Status,
  shown only when `status === "cleared"`, so the date can also be corrected
  after the fact — not just picked once at clear time.
- The ledger list row and per-account activity lists (`app.transactions.tsx`,
  `app.accounts.tsx`) show `cleared_date` alongside `transaction_date` only
  when it's set **and differs** — showing the same date twice is just noise.

Explicitly NOT changed: `src/lib/ledger-state.ts`'s `deriveCycleInfo()` cycle-
window attribution stays on `transaction_date` — which cycle a bill/debt
payment resolves should reflect when it was recorded/submitted against that
cycle, not whenever the bank happened to post it days later; switching this
risked a payment submitted before a due date but clearing after it slipping
into the wrong cycle. `resolved_cycle_due_date` (ADR-075) already exists as
the deliberate override for edge cases here. Dashboard pay-period/month
bucketing and Spending's month grouping also stay on `transaction_date`, for
the same reason — budgeting tracks when you committed to spending, not when
the bank got around to posting it.

Reason:
Reconciling the ledger against real bank/Venmo statements (recurring work this
session) kept hitting the same friction: a transaction logged `pending` one day
often doesn't clear until days later, and a bank statement only ever shows the
posted date. Verified live in `useMarkCleared` before this change: marking an
already-pending transaction cleared only flipped `status` — `transaction_date`
was never touched, so a payment submitted 9/9 and cleared 9/12 kept showing 9/9
forever with no record anywhere of 9/12.

Status: Decided 2026-09-09. Implemented 2026-09-09. Migration
`scripts/migrations/2026-09-09-transactions-cleared-date.sql` (+ `.verify.sql`)
written, pending the user running it manually per ADR-083.

