# One Edit button for linked transactions (ADR-088 proposal)

## Why you only saw one button

The "Correct / Reverse" box renders two icon buttons, but `CorrectPaymentButton`
hides itself whenever the correction isn't provably safe: the cycle is already
fully paid, or the transaction already resolved a cycle. On this Aaron's debt
payment the cycle is resolved, so Correct vanished and only Reverse remained —
a dead end that tells you nothing about why.

That split (Correct vs Edit vs Reverse) exists because the app writes the
bill/debt row first and the ledger row second, and the "Correct" mutation
deliberately refused to cross the paid/unpaid boundary. That's an
implementation limit leaking into the UI. Your instinct is right: from the
user's side there is one verb — Edit — and the app should do whatever
bookkeeping keeps the debt in sync.

## What changes

### 1. One "Edit" on a linked transaction

- Remove the Correct/Reverse box and the "amount and status are locked" notice
  from the transaction detail dialog.
- The Edit form for a linked payment unlocks Amount, Date, Account, Status,
  Category, Place — the same fields as any other transaction.
- Saving routes through a new payable-aware save. Instead of refusing a change
  that crosses the fully-paid boundary, it internally rolls the payable back by
  the old amount and re-applies the new one (the existing reverse math and
  apply math, run back to back, payable-first per ADR-037). Net effect on the
  debt: `remaining_balance`, `cycle_paid_to_date`, `payment_status`,
  `date_paid_off` and the minimum-payment recalc all land where they'd be if
  the payment had originally been entered with the new values.
- Changing status cleared → pending unwinds the payable effect; pending →
  cleared applies it. No more locked Status dropdown.
- Reverse stays, but only as an explicit action on the main card (below), not
  as a workaround for a missing edit.

### 2. Main transaction card: Edit and Reverse

On the detail view of a linked payment (single row or the group head), the
footer shows: **Edit** (primary) and **Reverse** (secondary). Delete stays
hidden for linked rows — Reverse is the correct undo, Delete would strand the
debt's counters.

### 3. Editing a payment + fee group, including adding lines

The Aaron's entry is a payment+fee group (ADR-046): one debt-linked row plus a
fee row sharing a `split_group_id`. Today that group is classified
`linked-or-multi` and forced into per-row editing, because the whole-group
editor deletes every row and re-inserts them — which would destroy the debt
link and its bookkeeping.

New behaviour: a group that contains exactly one linked payment row gets its
own group editor:

- Shared header fields — Date, Account, Status, Description — apply to all rows.
- A line list: the linked payment line (labelled "Debt payment · <name>", its
  amount editable and routed through the payable-aware save) plus any number of
  plain fee/charge lines with category + amount, each removable, with an
  "Add line" button.
- The group total is shown live and updates as lines change.
- Save = payable-aware update for the linked line, plus targeted
  insert/update/delete for the plain lines. No delete-and-reinsert of the
  linked row.
- Groups with more than one linked row, or spanning multiple accounts
  (paychecks, transfers), keep today's per-row editing — a single Edit can't
  safely reconcile two payables at once.

### 4. Copy cleanup

The breakdown hint becomes "Show breakdown"; the group card opens the group
editor directly rather than making you drill into a line.

## Trade-offs

- Unlocking Amount/Status on linked rows means an edit can now flip a bill or
  debt from paid to unpaid and back. That's intended — but it makes Edit a
  bigger hammer, so it stays behind the existing confirmation-free dialog with
  a one-line note under the amount: "Changing this also updates <debt name>."
- Rollback-then-reapply is not transactional across two tables. Order is
  payable first, ledger second (ADR-037), so a mid-failure leaves the payable
  adjusted and the ledger untouched — the same failure mode Reverse already
  has, and detectable by the existing Sync stored status tool (ADR-085).

## Technical notes

- `src/lib/payments.ts`: replace `useCorrectPayment`'s boundary rejections with
  a shared `applyPayableDelta` helper (rollback old effect, apply new effect),
  and export a `useEditLinkedTransaction` mutation taking the full edited field
  set. Keep `useReversePayment` as-is.
- `src/routes/app.transactions.tsx`: drop the `CorrectPaymentButton` /
  `ReversePaymentButton` box from `TransactionDetail`; enable the locked
  fields; add Reverse to the footer; add a `LinkedGroupDetail` component for
  the one-linked-row group case.
- `src/lib/split-groups.ts`: add a `payment-with-fees` classification (exactly
  one linked row, one account) so the router can pick the new editor;
  `assertCategorySplitRows` keeps guarding the destructive path.
- `src/components/CorrectPaymentButton.tsx` becomes unused on Transactions;
  Bills/Debts detail rows keep it until they're migrated, or it is removed
  there too in the same pass (recommended — same reasoning applies).
- Tests: extend `src/lib/payments.test.ts` for the boundary crossings
  (partial → full, full → partial, cleared → pending) and add a
  `split-groups.test.ts` case for the new classification.
- Docs: new ADR in `docs/DECISIONS.md` (ADR-088, superseding the ADR-077 UI
  split), plus `docs/SESSION.md` entry. No schema change.
