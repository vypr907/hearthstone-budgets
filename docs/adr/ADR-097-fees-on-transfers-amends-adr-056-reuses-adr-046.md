## ADR-097: Fees on Transfers (Amends ADR-056, Reuses ADR-046)

Decision:
Add Transaction's Transfer mode gains an optional "Fee" field alongside
Amount. "Amount" stays the clean, symmetric transfer (unchanged from
ADR-056/064: equal negative/positive rows on the from/to accounts, sharing
`transfer_group_id`). "Fee" is an extra amount debited **only** from the
from-account — e.g. a $100 transfer with a $1.75 instant-transfer fee (Venmo
→ a debit card) debits $101.75 from Venmo and credits $100.00 to the
destination.

Implementation reuses ADR-046's bill/debt fee mechanism as-is rather than
inventing a transfer-specific one: `insertFeeTransaction` (generalized to
take a label/institution_id instead of a full `Payable`) writes a third,
unlinked transaction on the from-account, categorized via the same
auto-created household "Fees" category, described `"Fee: <transfer
description or "Transfer">"`. It is paired to the transfer via
`split_group_id = <the transfer's group id>` — the same UUID already used
for `transfer_group_id` on the two legs, just carried in the fee row's
`split_group_id` column instead. The fee row's own `transfer_group_id` is
left null.

This pairing choice matters: `TransactionDetail`'s `transferPair` lookup
(`app.transactions.tsx`) finds "the other leg" by matching
`transfer_group_id` and expects exactly one row back, and `internalTransferIds`
(ADR-089, `internal-transfers.ts`) classifies a `transfer_group_id` as
"internal" (excluded from spending) whenever it sees both a negative and a
positive leg. Tagging the fee row with `transfer_group_id` instead of
`split_group_id` would have broken both: a third row in the pair breaks the
"exactly one other leg" assumption, and a fee is real spending that must NOT
be excluded the way the two-sided transfer itself is. Keeping it on
`split_group_id` only means the fee behaves exactly like an ADR-046 fee row:
a normal, categorized, one-sided transaction that counts as spend — reusing
`deletePairedFees` so deleting the transfer pair (`useDeleteTransferPair`)
also removes its fee.

Known cosmetic wart: because the fee is the only row carrying that
`split_group_id`, the ledger list's grouping helper (`groupLedgerRows` in
`split-groups.ts`) shows it as a one-line "Split · 1 categories" card with a
"Show breakdown" toggle, rather than a plain transaction card. Functionally
harmless (verified: the detail view shows the fee correctly, deleting it
works normally) — not fixed here since `groupLedgerRows` is shared by every
split/paycheck/payment-with-fees display and changing its size-1 handling is
out of this change's scope.

Bugfix surfaced along the way: `feeCategoryId()` (ADR-046) auto-creates the
household's "Fees" category on first use but never set `domain`, which is
NOT NULL on the live `categories` table (docs/SCHEMA.md previously
undersold this as nullable) — any household without a pre-existing "Fees"
category (verified against the TEST household) hit a DB error the first
time a fee was entered. Fixed by setting `domain: "spending"` on that
insert, consistent with a fee being real spending.

Reason:
The app already solved "a fee rides along a clean amount, debited from the
same account, without corrupting that clean amount's own math" for bill/debt
payments (ADR-046). A transfer fee is the identical shape — Venmo's instant-
transfer fee is real money that left the source account but isn't part of
the amount that actually reached the destination. Reusing the mechanism
verbatim (generalizing one helper's parameter) avoided a second, parallel
fee implementation.

Status: Decided 2026-09-08. Implemented 2026-09-08. Verified end-to-end
against the TEST household (ADR-083): write produces the expected 3-row
shape with correct amounts/category, `internalTransferIds` correctly leaves
the fee out of the excluded set, and deleting the transfer via the UI
cascades to remove all 3 rows.

**2026-09-08 addendum — cosmetic-wart fix, and editing a prior transfer's fee:**

1. **Fixed the "Split · 1 categories" wart.** The root cause was broader than
   display: any `split_group_id` shared by exactly one row (not just a
   transfer fee — any orphaned/solo one) was misclassified as a genuine
   split everywhere it was checked.
   - `groupLedgerRows` (`split-groups.ts`, used by every ledger list —
     transactions, accounts, pending) now precomputes each `split_group_id`'s
     row count first; a size-1 group is emitted exactly like an ungrouped row
     (`isSplit: false`, keyed by its own transaction id) instead of always
     defaulting a non-null `split_group_id` to `isSplit: true`.
   - `TransactionDetail` (`app.transactions.tsx`) had the same bug one layer
     deeper: its `isCategorySplitGroup`/`isPaycheckDeposit` checks required
     only `groupRows.length > 0`, so a solo fee row's `classifyLedgerGroup`
     fell through to the "category-split" default and opened the whole-group
     `SplitTransactionDetail` editor. Both guards now require `length > 1`.
     A related knock-on: the plain single-row edit form hid Category/Place
     for "paycheck deposit rows carry no category by design" using
     `!transaction.split_group_id` as the proxy — too broad now that a solo
     fee row also carries a `split_group_id` but does need those fields.
     Re-gated on `!isPaycheckDeposit` specifically.
   - Covered by new tests in `split-groups.test.ts` (solo split_group_id →
     not split; a real split group and an unrelated solo row classified
     independently) and unaffected: the existing paycheck/category-split/
     payment-with-fees tests all still pass unchanged.

2. **Editing a transfer's fee after the fact.** A transfer's own detail view
   (opened from either leg) now shows a "Fee" field alongside From/To, and
   editing that leg (Edit → Fee (optional) → Save) adds, changes, or removes
   the paired fee row — not just at creation time via Add Transaction. New
   `useSetTransferFee` (`data-hooks.ts`) does the insert/update/delete:
   insert reuses `insertFeeTransaction` when no fee row exists yet, a plain
   `amount` update when one does, and a delete when the field is cleared.
   The fee always attributes to the transfer's **from**-account regardless of
   which leg is currently open (resolved the same way `transferFromAccount`
   already is, by amount sign). A pre-existing fee row is also just a plain
   transaction now (per the wart fix above) and can be edited/deleted
   directly like any other transaction — the new "Fee" field on the transfer
   itself is for households whose transfer predates this feature, or who
   skipped the fee at entry time and want to add it later.

   Verified against the TEST household: seeded a fee-less transfer directly,
   added a $2.50 fee via the to-leg's edit form (confirmed it landed on the
   from-account, not the leg being edited), reloaded and confirmed the fee
   row renders as a plain card, opened the fee row directly and confirmed
   Category is editable, then cleared the fee via the from-leg's edit form
   and confirmed the fee row was deleted while both transfer legs were
   untouched.

2026-09-09 addendum — fee row links back to its transfer:
The 2026-09-08 addendum above made `TransactionDetail`'s transfer leg show
its paired fee (`transferFeeRow`, via `split_group_id === transfer_group_id`).
The reverse direction was still missing: opening the fee row itself showed a
plain single-account transaction with no indication it belonged to a
transfer at all. Fixed with the mirror-image lookup — `linkedTransferLeg`
finds a row whose `transfer_group_id` equals this row's own `split_group_id`
(only attempted when this row isn't itself a transfer leg), resolves both
account names the same way `transferFromAccount`/`transferToAccount` already
do, and renders a "Transfer" `DetailItem` in the same slot the plain
"Account" item would otherwise occupy. It's a clickable link (new optional
`onOpenTransaction` prop on `TransactionDetail`, wired at its one call site
in `app.transactions.tsx` to `setDetail`) that opens that transfer leg's own
detail view in place. No schema change; no change to the bill/debt payment-
fee shape (ADR-046), which was already bidirectionally visible as a real
2-row `split_group_id` group via `groupLedgerRows`/`isPaymentWithFeesGroup`.

Status: Decided 2026-09-09. Implemented 2026-09-09.

