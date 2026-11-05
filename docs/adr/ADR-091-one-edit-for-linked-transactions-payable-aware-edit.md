## ADR-091: One "Edit" for linked transactions (payable-aware edit)

(Originally drafted as a second ADR-088 on the 2026-08-31 feature branch, which
collided with the ADR-088 already on `main` from 2026-08-27. Renumbered to 091
on 2026-09-01; code comments updated to match.)

Decision:
A bill/debt-linked transaction is edited through the ordinary transaction Edit
button, not a separate Correct/Reverse affordance. Amount, date, status and
account are unlocked for linked rows; saving runs rollback-then-reapply on the
underlying payable (`rollbackClearedPayment` + `applyClearedPayment` in
`src/lib/payments.ts`, `useEditLinkedTransaction`) so `remaining_balance`,
`cycle_paid_to_date`, `payment_status`, `date_paid_off` and any
`resolved_cycle_due_date` tag are recomputed for the new values, including
across the pending/cleared boundary. Delete is replaced by Reverse (ADR-070)
for linked rows. A group that is exactly one linked payment plus plain fee
lines on one account is classified `payment-with-fees`
(`src/lib/split-groups.ts`) and opens a grouped editor that edits the payment
and its fees together, allows adding/removing fee lines, and never
delete-and-reinserts the linked row. Groups with >1 linked row or >1 account
stay per-row (`linked-or-multi`). ADR-077's CorrectPaymentButton remains on
the Bill/Debt detail screens only.

Reason:
ADR-077's Correct button only appeared for an un-resolved partial payment in
an unpaid cycle, so the common case — a cleared payment that closed its cycle,
or a wrong payment+fee split — had no reachable edit path and the transaction
Edit button locked the fields. Users think in terms of "edit the transaction";
keeping the bill/debt in sync is the app's job, not a second workflow.

Status: Decided 2026-08-31. Implemented.

**2026-10-16 addendum — fee lines in the grouped editor gain Type + Note,
and always compose their description.** The grouped `payment-with-fees`
editor's "add new lines" feature (`LinkedGroupDetail`, `src/routes/
app.transactions.tsx`) previously had no fee/interest/tax type concept at
all — each line was just a `category_id` Select (a real FK, unrelated) plus
an amount Input; a `description` field existed in local state but was never
rendered in any input. Worse, the save handler wrote
`line.description || \`Fee: ${payable.name}\`` — a raw full-string override
with no `"Fee: "` prefix enforcement, structurally looser than the
`insertFeeLines` convention (ADR-046/084 addenda) every other fee-entry
path already uses. Both are fixed together: each line now has a Type
`<Select>` (`LINE_TYPES`, `src/lib/payments.ts` — Fee/Interest/Late
fee/Processing fee/Tax/Other charge) and a Note `<Input>`, and the saved
`description` is always composed via a new shared
`composeFeeDescription(label, type, note)` (factored out of
`insertFeeLines`, which now calls it too) — never a raw override. A new
inverse helper, `parseFeeDescription(description, label)`, reconstructs
`{type, note}` when loading an *existing* row into the editor; anything
that doesn't match the exact composed shape (older rows predating this
convention, or text from the old raw-override path) falls back to
`type: "other"` with the original string kept as the note, so nothing is
silently discarded. No schema change — same `transactions.description`
string, same `"Fee: "` prefix every classifier (`isFeeTransaction`,
`clearPairedFees`, `deletePairedFees`, `debtBalanceAsOf`,
`computeAdvanceEpisodes`) already matches on.

Status: addendum decided 2026-10-16. Implemented 2026-10-16 — `tsc --noEmit`
clean, 274/274 tests pass. Not yet checked in a running browser.

