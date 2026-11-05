## ADR-111: Per-Advance Episode History for `debt_type = 'advance'` Debts

Decision:
Scoped only to `debt_type === 'advance'` debts (currently OnePay Advance,
unlinked, and Dave ExtraCash, linked — ADR-102), replace the flat
"Advances" list on the debt detail screen with a partitioned view: each
advance draw, its fees, and its eventual repayment grouped as one
expandable "episode" card (date range, advance amount, fees total, repaid
total, net remaining, status badge), instead of one blended running
number. No schema change — this is a pure, read-only derived view built
entirely from data already written unconditionally for every advance
debt:
- `debt_adjustments` rows with `adjustment_type === 'advance'`, sorted by
  `(adjustment_date, created_at)` (tie-broken by id), are the episode
  boundary markers. Episode *i* spans `[marker_i, marker_{i+1})`; the last
  marker's episode is open-ended. Anything dated before the first marker
  (real pre-tracking data on OnePay Advance) lands in an unlabeled
  "episode 0".
- New pure function `computeAdvanceEpisodes(debt, adjustments,
  transactions, accounts, accountBalances)` in new `src/lib/debt-episodes.ts`,
  mirroring the partitioning shape of `debt-history.ts`'s
  `debtBalanceAsOf()` but split per advance instead of per debt.
  - **Unlinked debts** (OnePay Advance): sums `linked_debt_id`-tagged
    transactions in-window, using the same `isAdvanceDisbursement`/
    `isFeeTransaction` classifiers (`payments.ts`) `debtBalanceAsOf`
    already uses, but fees are captured into their own `feesTotal`
    instead of being dropped.
  - **Linked debts** (Dave ExtraCash): sums *every* transaction on
    `linked_account_id` in-window, regardless of `linked_debt_id`
    tagging — the account's real history is ground truth, not the tag.
    This is deliberately stricter than the unlinked case and is what
    makes an untagged duplicate payment (e.g. one logged through the
    generic Transfer form instead of "Log a payment") visible as an
    overpayment instead of silently invisible, which is exactly the shape
    of bug that caused Dave's balance to read $15 low (see the ADR-102
    2026-10-13 addendum). The window's own disbursement mirror leg is
    excluded by matching amount+date 1:1 against its marker in sort
    order (handles a confirmed real same-day double-advance on Dave,
    2026-09-04 — two $50 draws).
  - **Anchor override**: naively replaying carry-forward from the very
    first advance marker ever written ignores the `account_balances`
    snapshot anchor that `effectiveDebtBalance()`/`balanceAsOf()` treat as
    ground truth, and was found live to produce a wildly inflated number
    for Dave (~$245 instead of ~$25) because it double-counted everything
    before the household started snapshotting that account. Fixed by
    accepting `accounts`/`accountBalances` and overriding just the final
    (open) episode's `net`/`status` with `creditOwed(balanceAsOf(account,
    accountBalances, transactions, todayISO()))` — reusing the existing,
    already-proven anchor logic rather than reimplementing it. Only the
    last episode is overridden; earlier, closed episodes keep their
    replayed totals since they are historical and the anchor only applies
    going forward from its own date.
  - **Status per episode**: `open` (the last episode, net > 0), `repaid`
    (net ≤ 0), or `carried_forward` (an earlier, closed episode whose
    shortfall rolled into the next draw) — new information the prior flat
    list never showed.
- `src/routes/app.debts.tsx` (`DebtAdjustments`): flat `advances.map(...)`
  replaced with `episodes.map((ep) => <AdvanceEpisodeCard ... />)`, a new
  expandable card component. Existing delete actions (`useDeleteAdvance`,
  `useDeleteDebtAdjustment`) stay reachable inside each expanded card,
  nested instead of flat — no hook changes, presentation only. Also wired
  `useAllAccountBalances()` alongside the already-fetched `accounts` so
  the anchor override above actually applies live, not just in tests.
- Companion UI fix bundled in the same pass: see the ADR-102 2026-10-13
  addendum for restoring the "Record advance"/"Add adjustment" buttons for
  linked advance debts specifically (they had been hidden for every linked
  debt since 2026-09-15, including Dave, which is what motivated looking at
  this screen in the first place).

Reason:
The user wanted to take a $50 advance and be able to see its own lifecycle
— draw, fees, repayment — as one unit, rather than inferring it from a
blended balance. An advance-type debt can only have one open advance at a
time (confirmed with the user, ADR-084 2026-09-04 addendum — must repay
before taking another), which is exactly the property that makes
boundary-marker partitioning well-defined with no overlap to resolve.

Not covered: no new write path or schema — this is strictly a read/display
feature. Credit-card debts (Milestone, CreditOne, Mission Lane) are
untouched; `computeAdvanceEpisodes` returns `[]` immediately for any
`debt_type !== 'advance'`.

Status: Decided 2026-10-13. Implemented 2026-10-13 — `tsc --noEmit` clean,
268/268 tests pass (13 new, in `debt-episodes.test.ts`, including a
regression test for the untagged-duplicate-payment case and a regression
test for the anchor-override fix). Live-data spot check against Dave
ExtraCash's real rows via the read-only MCP confirms the open episode's net
matches `effectiveDebtBalance` both before and after the pending Step 0 SQL
fix (duplicate $15 transfer — see ADR-102 2026-10-13 addendum; not yet run
by the user). Not yet checked in a running browser — needs a Codespace or
real device pass to confirm the restored button, updated copy, and new
episode cards actually render/expand correctly.

**2026-10-14 addendum — fixed the linked branch's blind spot to pre-link
history, fixed status to resolve retroactively, and added a combined
advance+fee entry.** After the Step 0 fix landed, the live view on Dave
ExtraCash still showed every episode before the latest as "Carried
forward" with an inflated owed amount, and no repayment ever appeared.
Root-caused live (read-only MCP) to two real bugs, not one:

- **The linked branch's content was blind to anything before the account
  was linked (2026-09-11).** Every advance/repayment before that date was
  logged tagged to the debt (`linked_debt_id`) but on whichever account
  was actually used (Checking, etc.) — never mirrored onto Dave
  ExtraCash, because mirroring didn't exist yet. Summing only the linked
  account's own transactions saw zero activity for any of those windows
  and treated "no data" as "never repaid." Fixed: `computeAdvanceEpisodes`
  now also pulls in every other `linked_debt_id`-tagged transaction for
  the debt found on a *different* account, excluding `isAdvanceDisbursement`
  (already counted via the marker), a new `isArrearsOnlyPayment()`
  (`payments.ts`, same shape as the existing disbursement/fee checks —
  matches `useMarkArrearsPaid`'s `"Arrears payment · "` rows, which only
  ever move `arrears_paid_to_date`, never principal; found live that
  including one broke an otherwise-exact reconciliation), and any
  transaction sharing a `transfer_group_id` already represented via the
  linked account's own history (the other leg of an already-mirrored
  pair — counting both would double the event). The two sources use their
  own already-established, opposite sign conventions (account-centric for
  the linked account's own rows; paying-account-centric, matching
  `debtBalanceAsOf`'s, for the cross-account ones) rather than one shared
  rule. Verified live: the merged reconstruction lands on exactly $40 for
  Dave's still-open episode — independently matching the existing
  anchor-based override.
- **Status only ever looked one window ahead.** `applyCarryForward` asked
  "did this window's own shortfall clear by the very start of the next
  marker" — too narrow, since a shortfall legitimately gets absorbed one
  or more windows later (confirmed live: the $40 7/17 draw's shortfall is
  cleared by a payment dated 7/31, inside the *next* window). Rewritten to
  resolve retroactively: when the running carry returns to zero at window
  *i*, every still-pending window back to the last resolution point is
  marked `"repaid"`, not just window *i*. General fix, both branches —
  `debt-episodes.test.ts`'s existing carry-forward test updated to match
  (episode 1's shortfall, resolved by episode 2's payment, now correctly
  reads `"repaid"`); a new test confirms a shortfall that's *never*
  resolved before the end of the chain still correctly reads
  `"carried_forward"`, not a false `"repaid"`.
- **Fees total now includes an unmirrored adjustment.** The two existing
  "Overdraft Fee" adjustments on Dave (`mirror_transaction_id` null —
  predate the mirroring convention) were previously skipped outright for
  linked debts (assuming every adjustment is already mirrored, true for
  every other one on this debt). Now included directly when
  `mirror_transaction_id` is null.
- **Expanded card shows the real contributing transactions**, not just
  `debt_adjustments` rows (`AdvanceEpisodeCard`, `app.debts.tsx`) — the
  episode's own `transactions` were already computed, just never rendered.
- **Combined advance+fee entry**: "Record advance" gets an optional "Fee"
  field (same shape as ADR-110's optional ATM-fee field). On save, if the
  fee is non-zero, `useAddDebtAdjustment` runs immediately after
  `useCreateAdvance` with `adjustment_type: 'advance_fee'` and the same
  date — no schema change, the existing date-windowing already attributes
  a same-day adjustment to the right episode.
- One-time SQL backfill drafted for the two orphaned Overdraft Fee
  adjustments' missing mirror transactions
  (`scripts/migrations/2026-10-14-dave-overdraft-fee-mirrors.sql`), so the
  account's own ledger is complete too — not required for the view's
  numbers (it includes an unmirrored adjustment directly either way), just
  data completeness.
- Flagged, not fixed here (filed as a GitHub issue instead): `debt-history.ts`'s
  `debtBalanceAsOf` (Year in Review's historical trend, every debt type,
  not just advances) has the identical un-excluded-arrears-row gap —
  confirmed live, the "Car" debt has its own "Arrears payment" row that
  would skew its trend the same way. Out of scope here since it touches a
  different feature's trusted reconstruction logic for every debt, not
  just advances.

Status: addendum decided 2026-10-14. Implemented 2026-10-14 — `tsc --noEmit`
clean, 270/270 tests pass. Live-data spot check (scratch test against
Dave's full real cross-account history, read-only MCP) confirms every
episode before the latest now reads `"repaid"` and the latest reads
`"open"` at exactly $40, matching the live anchor-based figure. Not yet
checked in a running browser.

**2026-10-15 addendum — two more bugs found live on EarnIn (unlinked),
both in the shared `applyCarryForward`/disbursement-matching logic, so
they affect every unlinked advance debt, not just EarnIn:**

- **A debt's very first disbursement could be double-counted.**
  `useCreateAdvance` inserts the disbursement transaction (Step 1) a
  fraction of a second *before* its `debt_adjustments` row (Step 3) — so
  for a debt's very first tracked advance, the disbursement's own
  `created_at` can sort as earlier than the marker's own, even though
  both are the same real event. The unlinked branch's pre-tracking-orphan
  detection (`txKey < firstKey`) treated this as a genuine orphan (the
  real OnePay case — a disbursement with no matching marker at all),
  double-counting the draw: once via the orphan bucket, once via the
  marker's own `advanceAmount`. The phantom extra amount then never gets
  repaid, permanently inflating every later episode's carried balance so
  nothing downstream ever resolves. Fixed the same way the linked branch
  already handles this: match each marker to its own disbursement by
  amount + date (not creation-order) before falling back to orphan
  detection for whatever's left unmatched.
- **`applyCarryForward`'s retroactive resolution skipped the last
  window.** The 2026-10-14 fix (above) only retroactively marked earlier
  pending episodes `"repaid"` when an *intermediate* window's carry hit
  zero — if the chain's shortfall doesn't clear until the very last
  window's own payment, that last window got its status set directly
  (`"open"`/`"repaid"`) without ever running the retroactive backfill for
  the pending episodes before it, leaving them stuck at
  `"carried_forward"` even though the debt was, in fact, fully settled.
  Fixed by running the same retroactive-backfill check unconditionally on
  every window, last or not.

Together, on EarnIn's real history, these explained "showing a lot of
carried forward on the advances, instead of the payments being made
going towards the correct advance" exactly as reported: every episode
now correctly reads `"repaid"` except the still-open one, and the
reconstructed final balance is $0 — see the separate note in
`docs/SESSION.md` about that number not matching EarnIn's currently
*stored* `remaining_balance` ($200), a distinct data-reconciliation
question this fix surfaced and (confirmed with the user) resolved by
correcting the stored row to match.

Auditing the rest of the household's advance debts after these two
fixes (`docs/SESSION.md` has the per-debt detail) surfaced a third,
independent bug: `splitFeesAndRepaid` counted a `"Fee: "`-prefixed
transaction's abs amount into `feesTotal` (which feeds `net`) — unlike
`debtBalanceAsOf`, which excludes these entirely (ADR-084: a fee/interest
line attached to a logged payment is ledger-only, never touching
`remaining_balance`). Confirmed live on two debts (Cleo, Instacash): each
reconciled to its real, stored $0 balance only once "Fee: " transactions
were excluded from the math the same way `debtBalanceAsOf` already
excludes them — the earlier inclusion ("surfaced here on purpose")
inflated the reconstructed net above the true balance by exactly each
debt's own fee total. Fixed by skipping `isFeeTransaction` content
entirely in `splitFeesAndRepaid`, matching `debtBalanceAsOf` byte for
byte; the fee transaction is still visible in the episode's own
`transactions` list for transparency, just excluded from the balance
math. A fourth debt (OnePay Advance) still didn't reconcile even with
all three fixes applied — tracked down to a fourth, independent bug and
a set of real data gaps, both resolved (below).

**Fourth bug — `applyCarryForward` floored the running `carry` at zero
after every window, not just once at the end.** `debtBalanceAsOf` is one
continuous running sum, floored (`Math.max(0, balance)`) exactly once at
the very end of its walk — a transient overpayment earlier in the
history can offset a later draw. `applyCarryForward` instead floored
`carry` at every window boundary, silently discarding that kind of
credit instead of letting it carry forward. Found live on OnePay
Advance: an early cycle was overpaid by $6.75 (a fee paid out of pocket
but never added to what the debt itself owed, since it was logged as a
ledger-only "Fee: " line rather than a balance-affecting adjustment) —
the per-window floor lost that credit, inflating every later episode's
reconstructed balance by exactly $6.75 relative to `debtBalanceAsOf`'s
own math on the same data. Fixed by only flooring the *displayed* `net`
(`Math.max(0, carry)`), leaving the internal `carry` free to go negative
between windows, matching `debtBalanceAsOf` exactly. General fix, not
OnePay-specific — 1 new regression test.

**OnePay Advance's real data gaps**, found by walking its full
chronological history with the user: (1) a real 2026-07-02 $225 advance
was never logged as a `debt_adjustments` marker, only its disbursement
transaction existed; (2) two real $231.75 repayments (2026-08-11,
2026-08-27) existed in the ledger but were entered as two "Fee: OnePay
Advance" lines with no `linked_debt_id` at all — the $225 "principal"
half of each was invisible to the debt's own tracking (wrong
description, untagged); the $6.75 fee half of each was already correct
(a legitimate ledger-only "Fee: " line); (3) the still-open 2026-09-11
draw was missing its own $6.75 fee adjustment (confirmed real with the
user, following the same convention one earlier cycle already used).
Fixed via `scripts/migrations/2026-10-15-onepay-reconcile.sql`: adds the
missing marker and fee adjustment, retags the two mislabeled
repayments, and corrects the stored `remaining_balance`/`minimum_payment`
to $231.75 (the still-open cycle's own $225 + $6.75, confirmed by
reconstructing the full corrected ledger with both code fixes applied)
and `next_due_date` to 2026-10-08 (the cycle's real due date per the
user — the stale prior value predates this draw and would otherwise
trip a false "past due" once the balance is nonzero again).

Status: addendum decided 2026-10-15. Implemented 2026-10-15 — `tsc
--noEmit` clean, 274/274 tests pass (4 new regression tests in
`debt-episodes.test.ts`). Live-data spot checks (scratch tests against
EarnIn's, Cleo's, Instacash's, and OnePay Advance's real histories,
read-only MCP) confirm every episode now reads "repaid" except each
debt's still-open one, and all four debts' reconstructed totals match
their real, confirmed balances exactly. Not yet checked in a running
browser.

**2026-10-15 addendum — manual due date on "Record advance," and a
double-count warning on "Log a payment":**

- **"Record advance" gains a "Due date" field.** It previously only ever
  wrote a *silent* auto-computed guess (`nextPayDate`, ADR-056 addendum —
  the household's next paycheck after the draw) with no way to see or
  correct it. The field is now shown, pre-filled with that same guess,
  and editable — e.g. to match what the lender itself actually says is
  due, which doesn't always line up with paycheck timing.
  `useCreateAdvance` (`src/lib/data-hooks.ts`) gains an optional `dueDate`
  param that overrides the auto-computed value when provided; the RPC's
  own fill/reset gating (null, or prior balance settled — ADR-102
  2026-10-14 addendum) is unchanged, so a confirmed value still won't
  clobber a genuinely still-open advance's own due date.
- **"Log a payment" warns when a fee was already logged at draw time.**
  If the current (still-open) advance episode already has an
  `advance_fee`-type adjustment (from "Record advance"'s combined Fee
  field, ADR-111 2026-10-14 addendum), a note now appears above "Fees &
  interest" — reusing `computeAdvanceEpisodes` (already computed
  elsewhere) rather than new logic, since its latest episode's
  `adjustments` already carries exactly this. Not a hard block (a
  genuinely separate charge, e.g. a late fee, is still a legitimate
  line) — just a clear warning, since the Principal field already
  defaults to the full amount owed (`debtRemainingOwed`), which already
  includes that fee.
- **Clarified, not changed**: whether a fee counts toward a "Fees"
  category total for the year depends entirely on which of these two
  patterns was used. A `debt_adjustments`-sourced fee (Record Advance's
  Fee field, or a manual "Add adjustment") never gets a `category_id` —
  for an unlinked debt it writes no transaction at all; even the mirror
  transaction `useAddDebtAdjustment` writes for a *linked* debt has none.
  A `"Fee: "`-prefixed transaction (Log a Payment's fee lines) always
  does, via `feeCategoryId()` (`payments.ts`) — confirmed by code trace,
  not changed here. A household wanting fee amounts to show up in yearly
  category totals should prefer the fee-line pattern.

Status: addendum decided 2026-10-15. Implemented 2026-10-15 — `tsc
--noEmit` clean, 274/274 tests pass (no new pure logic — both changes
reuse already-tested functions: `nextPayDate`, `computeAdvanceEpisodes`,
`debtRemainingOwed`). Not yet checked in a running browser.

**2026-10-15 addendum — Method 1's fee now categorized too.** The user
wanted a `debt_adjustments`-sourced `advance_fee` (Record Advance's
combined Fee field) to count toward a yearly "Fees" category total the
same way a `"Fee: "` payment line already does, having just learned it
didn't. `useAddDebtAdjustment` (`src/lib/data-hooks.ts`) now resolves
`feeCategoryId()` (`payments.ts`, already used by `useLogDebtPayment`'s
fee lines) and sets it on the mirror transaction — for a **linked** debt,
the existing mirror onto `linked_account_id` now carries it; for an
**unlinked** debt (no account to mirror onto at all), a new optional
`mirrorAccountId` param lets the caller supply one — "Record advance"
passes the advance's own destination account (the only real account in
play at draw time), so the fee now writes a real, categorized
transaction there instead of staying invisible to spending totals.
Scoped to `adjustment_type === 'advance_fee'` only (not every adjustment
type — an insurance credit or manual correction isn't necessarily real
spending). No `linked_debt_id` on this new transaction, same reasoning
as every other mirror leg (stays invisible to cycle-progress math); it's
a parallel, category-tracking-only write, not picked up by
`computeAdvanceEpisodes`'s own balance math (which still reads the
`debt_adjustments` row directly for an unlinked debt). The standalone
"Add adjustment" dialog never passes `mirrorAccountId`, so its behavior
for every other adjustment type and debt is unchanged.

Status: addendum decided 2026-10-15. Implemented 2026-10-15 — `tsc
--noEmit` clean, 274/274 tests pass. Not yet checked in a running
browser.

**2026-11-03 addendum — concurrent advances (Issue #82): the single-open-
advance assumption was wrong, replaced the date-window model with FIFO
per-draw allocation.** This ADR's original Reason section stated "An
advance-type debt can only have one open advance at a time... must repay
before taking another" (confirmed with the user at the time, ADR-084's
2026-09-04 addendum). That's now confirmed WRONG, surfaced by this
session's Cleo reconciliation: the household took 3 concurrent $55 draws
(10/15, 10/16, 10/20) before repaying any of them, which is normal
behavior for this class of app (a credit limit, not a one-open-advance
rule, bounds how much can be drawn).

The original implementation built a fixed date window between each marker
and the next (`[marker[i].date, marker[i+1].date)`) and bucketed every
fee/repayment by which window its date fell in. The last marker's window
was open-ended and silently absorbed everything dated on/after it —
visibly wrong on Cleo's real episode cards (fees and repayments for
earlier draws all showing up attributed to the most recent draw).

`computeAdvanceEpisodes` (`src/lib/debt-episodes.ts`) now gives each draw
its own independent running balance and allocates every fee/repayment to a
specific draw via a single chronological walk (`runFifoAllocation`),
replacing `applyCarryForward`/`RawWindow`/`inWindow` entirely:
- A repayment is always FIFO-allocated: drains the oldest still-open draw
  first, cascading into the next-oldest open draw once the first is fully
  zeroed. This is a stated allocation CONVENTION, not a recovered fact —
  nothing in the data model (`transactions` or `debt_adjustments`) links a
  repayment to the specific draw it closes, confirmed while designing this.
- A fee/charge can be attributed to a specific draw via `resolveFeeMarkerHint`,
  which parses the existing `"(M/D advance)"` convention already present in
  this household's own fee descriptions (e.g. "Express fee (10/15
  advance)") — the same description-prefix-as-type-system trick
  `isAdvanceDisbursement`/`isFeeTransaction`/`isArrearsOnlyPayment` already
  use. No match (wrong format, or an ambiguous month/day shared by two
  markers) falls back to the same FIFO-oldest-open rule as a repayment. A
  resolved hint can REOPEN an already-resolved draw (a late-assessed fee
  genuinely re-inflates it) — something the old single-shared-balance model
  had no way to represent at all.
- A real structural link (a new nullable FK column on `transactions`/
  `debt_adjustments` pointing at the originating marker, plus a "which draw
  is this for?" UI picker) was considered and deliberately DEFERRED — it
  would need its own ADR + migration + UI work, and wouldn't by itself
  eliminate the need for the text-parsing fallback (historical rows have no
  column to populate without a backfill). Revisit if the fallback proves
  unreliable in practice.
- `"Fee: "`-prefixed ledger-only transactions keep their ADR-084 exclusion
  from `feesTotal`/`net` exactly as before — they're still attributed to a
  specific draw's `transactions` list for display, just never change that
  draw's balance. Confirmed this session that fixing attribution doesn't
  require redefining what counts toward the stat; left alone.
- `AdvanceEpisodeStatus`'s `"carried_forward"` value is retired (confirmed
  with the user) — the ambiguity it flagged ("we can't tell if this
  shortfall was secretly resolved elsewhere") no longer exists once every
  draw's balance is tracked independently and exactly; every episode now
  reads `"open"` or `"repaid"`. The type keeps the string for consumer
  compatibility (`app.debts.tsx`'s status-label/variant `Record`s key off
  all three); the engine just never emits it.
- Two `AdvanceEpisode` fields change MEANING, not type (invisible to
  `tsc`, verified instead by hand-tracing the real Cleo data and a browser
  check): `net` was the whole debt's cumulative running balance, now it's
  this draw's own remaining balance; `endDate` was "the date the next
  marker opened" (a window boundary), now it's "the date this draw's own
  balance resolved to zero, or `null` while open."
- The "pre-tracking" bucket (events predating the earliest marker) is no
  longer a separately-computed special case — it's just the first entry in
  the same FIFO walk (`id: null`), behaving exactly like any other draw
  once "opened," with its own independent balance like everything else.

`LogDebtPaymentDialog.tsx`'s advance-fee double-logging warning (only ever
checks the LATEST episode) has a real, pre-existing gap that concurrent-
draw support makes more likely to matter — no UI exists yet to say "this
payment is for THIS specific open draw." Flagged as a known limitation,
not fixed here (would need the deferred schema/UI work above; out of scope
for a read-side history-display fix).

Status: addendum decided 2026-11-03. Implemented 2026-11-03 — `tsc
--noEmit` clean, 283/283 tests pass (6 new concurrent-draw fixtures; 5
existing tests updated to the new per-draw `net`/FIFO-split semantics, all
other existing tests — including every real-household-data regression for
Dave ExtraCash/EarnIn/OnePay Advance — pass unchanged). Live sanity-checked
against the real Cleo debt via the read-only MCP. Not yet checked in a
running browser.

