## ADR-098: Transfer Transaction Titles Show Source -> Destination

Decision:
Either leg of a transfer (`transactions.transfer_group_id` set, ADR-056) titles itself
`"<Source account> → <Destination account>"` instead of falling back to generic
"Transaction" text or showing only whatever manual description was typed. This always
wins over the normal place-based title (ADR-053/063) for a transfer row. Any manual
description (e.g. "Xfer to Steph") is kept, rendered as the same small italic subtitle
already used for a place's description — nothing the user typed is lost, it just no
longer stands in as the whole title.

Reason:
A transfer's two legs often carry no description at all (nothing to describe — the
"place" is just the other account), which previously rendered as the unhelpful literal
string "Transaction" in both the ledger list and the detail dialog. Source/destination is
the one piece of information that's always true and always useful for a transfer,
regardless of whether a description was entered.

Implementation: `TransactionTitle` (`src/components/TransactionTitle.tsx`) gains two
optional props, `transferFromAccount`/`transferToAccount`; when both are present and
`transaction.transfer_group_id` is set, it renders the arrow format ahead of every other
branch. The two callers resolve the names differently since they have different data in
hand: `TransactionDetail` (`app.transactions.tsx`) already computes
`transferFromAccount`/`transferToAccount` for its own From/To detail items and just passes
them through; the ledger list builds a one-time memoized map
(`transferTitleAccounts`, keyed by transaction id) from the full transaction list instead
of an O(n) lookup per row. `src/routes/app.accounts.tsx`'s two per-account transaction
lists (`AccountAllTransactions`, `RecentActivity`) are NOT wired up — they only receive a
single account's `rows`, not the full cross-account transaction list needed to find the
other leg, and already show a "Transfer" badge next to the amount as a weaker signal.
Revisit if that gap turns out to matter in practice.

Status: Decided 2026-09-09. Implemented 2026-09-09.

Addendum (2026-09-11): the Accounts & Balances gap above did turn out to matter — wired
up. `AccountsPage` (`app.accounts.tsx`) now builds the same `transferTitleAccounts` map
(keyed off its own already-fetched full `useTransactions()` list, same shape as the
Transactions screen's) and threads it through `RecentActivity`, `AccountAllTransactions`,
and the `AccountDetailDialog` that hosts the latter. All three transfer legs now render
"Source → Destination" regardless of which screen they're viewed from. No data change —
this is purely a rendering gap; every existing `transfer_group_id` pair already had both
legs in the database. Verified in-browser (Playwright against a throwaway TEST-household
account + transfer pair, cleaned up after): both `RECENT ACTIVITY` and `ALL TRANSACTIONS`
on the Accounts screen now show the arrow, matching the Transactions screen. Status:
Implemented 2026-09-11.

