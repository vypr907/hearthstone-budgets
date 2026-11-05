## ADR-110: ATM Withdrawal Fees Reuse the ADR-097 Fee-on-Transfer Pairing; 🏧 Transfer-Leg Title

Decision:
An ATM cash withdrawal — a transfer whose destination account is Cash-type
(the `account_type = 'cash'` convention from ADR-103) with an associated
withdrawal fee — is linked using the EXISTING ADR-097 convention
(`split_group_id` on the fee row equals the transfer's own
`transfer_group_id`) instead of staying two unrelated rows. No schema
change: this generalizes ADR-097 (demonstrated there with a Venmo
instant-transfer fee) to the Cash-destination case, and reuses
`insertFeeTransaction` (`payments.ts`) as-is — it already accepts the fee
row's own `institution_id`.

- **Going forward** (`AddTransactionFab.tsx`): Transfer mode's "Fee" field
  gains an optional place picker, shown only when the destination account
  is Cash-type, so the fee's `institution_id` can be the ATM's own
  merchant/location instead of defaulting to the from-account's own bank
  (the correct default for the pre-existing Venmo-fee case, wrong here).
  Leaving the picker blank keeps today's behavior byte-for-byte.
- **Retroactively**: new `useLinkTransferFee` (`data-hooks.ts`) sets
  `split_group_id` on an ALREADY-EXISTING standalone transaction to an
  existing transfer's `transfer_group_id` — the first hook in this
  codebase to set a group id on a row after insert time (every prior
  transfer/split write path only ever sets one at creation). Validates:
  same household; the transfer is a clean two-row pair; the candidate row
  isn't already linked to anything; its account matches the transfer's
  debited (from) leg; its amount is negative; its date is within a shared
  tolerance (`ATM_FEE_LINK_MAX_DATE_DIFF_DAYS`, `atm-fee-link.ts`) of the
  transfer's date.
- **Repair screen** (`app.fix-atm-fees.tsx`, registered in `app.more.tsx`'s
  Tools grid): a new guided screen, modeled on `app.fix-places.tsx`'s
  layout and `StrandedBillRepair.tsx`'s per-item confirm/skip +
  `localStorage` dismissal. `atm-fee-repair.ts`'s pure
  `findUnlinkedAtmFeeCandidates` finds unlinked Cash-destination transfers
  and unlinked small placed expenses and matches them by account + date
  proximity — returning EVERY plausible transfer for a given fee, not just
  the closest, so a day with two withdrawals at the same place shows a
  chooser instead of silently guessing. Nothing is ever auto-linked. This
  screen is also the ongoing mechanism for newly bank-synced pairs, which
  arrive with no awareness of this app's linking convention.
- **Display** (`TransactionTitle.tsx`): the transfer-leg title (ADR-098,
  `"<Source> → <Destination>"`) gains one more precondition before it
  wins: when the destination account is Cash-type AND a row sharing
  `split_group_id === transfer_group_id` has `institution_id` set, it
  renders `🏧 <place name>` instead. Scoped narrowly to Cash-destination
  transfers only — a Venmo-style fee transfer (or any other) keeps the
  arrow, unconditionally. `TransactionTitle` stays a dumb render component;
  each caller resolves the new `atmPlaceName` prop itself (new shared
  helper `src/lib/transfer-title.ts`), same as `transferFromAccount`/
  `transferToAccount` already are. The existing 💵
  `ACCOUNT_TYPE_META.cash.icon` (`visual-meta.ts`, the Cash *account's* own
  icon) is untouched — 🏧 is a new, separate icon for this specific
  transfer-leg title case, never conflated with it.

Not covered / accepted as-is:
- This cannot structurally distinguish a true ATM fee from an ADR-103
  "Cash Back" purchase row riding the same Cash-destination transfer —
  both pair via the identical `split_group_id`/`transfer_group_id`
  convention on the same (from) account, and the one signal that would
  disambiguate them (a fee row's description always starting `"Fee: "`)
  does not survive retroactive linking, which deliberately leaves the
  linked row's own description untouched. Interviewed and confirmed
  acceptable: a Cash Back transfer leg showing `🏧 <merchant>` is still
  factually true (cash was received at that merchant there), not a bug.
- A fee row created going-forward through the new place picker still
  titles itself literally `"Fee: Transfer"` in the ledger (its description
  always starts `"Fee: "`, which `TransactionTitle`'s existing `isGeneric`
  check excludes from place-based titling) — only the transfer leg's own
  title changes. Same category of cosmetic gap ADR-103 itself left
  undone for its own ledger-list card; not fixed here either.

Reason:
Today an ATM withdrawal writes two independent, unlinked things: an
ADR-056 transfer pair for the cash, and a separate standalone expense for
the fee. The transfer leg's title falls back to the generic "Checking →
Cash" instead of anything merchant-related, and neither row shows that it
describes the same real-world trip — confirmed against the user's own
"Nature's Releaf" example, where reconciling against a bank statement by
eye was error-prone on a day with more than one withdrawal at the same
place. ADR-097 already solved this exact shape (a transfer with a fee
debited only from the source) for a bank's own instant-transfer fee; the
only reason it was never used for ATM withdrawals is that nothing wrote
through it for that case. Reusing the identical mechanism, rather than
inventing a second parallel linking convention, keeps
`useDeleteTransferPair`'s existing by-group-id deletion, `split-groups.ts`
grouping, and `TransactionDetail`'s `transferFeeRow`/`linkedTransferLeg`
lookups all working unmodified.

Status: Decided 2026-10-02. Implemented 2026-10-02 — `tsc --noEmit` clean,
255/255 tests pass (9 new, in `atm-fee-repair.test.ts`). Detection heuristic
cross-checked against live household data via the read-only MCP: no false
positives, and one real ATM-fee/transfer pair already linked by hand
(Nature's Releaf, `transfer_group_id`/`split_group_id` `51940400-…`)
confirms the convention matches real data. Not yet checked in a running
browser — this sandbox can't reach `npm run dev`'s port and the Playwright
smoke-test setup needs a Codespace; needs a manual click-through before
fully trusting the 🏧 rendering and the repair screen's live behavior.

