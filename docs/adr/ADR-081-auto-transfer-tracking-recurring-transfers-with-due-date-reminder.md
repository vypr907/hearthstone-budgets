## ADR-081: Auto-Transfer Tracking (Recurring Transfers with Due-Date Reminder)
Decision:
New `auto_transfers` table tracks recurring auto-transfers between the household's own
accounts (e.g. SoFi/Stash biweekly investing sweeps) as their own item type, distinct
from Bills and from ad-hoc Transfers. Columns mirror `bills`' scheduling fields
(`next_due_date`, `billing_cycle`, `cycle_interval_days`, `is_active`) plus
`from_account_id`/`to_account_id`/`amount`/`category_id`, but omit all
arrears/partial-payment columns (`cycle_amount_due`, `cycle_paid_to_date`,
`opening_arrears`, etc.) — an auto-transfer either happened this cycle or it didn't,
there is no partial state.

`transactions` gains `linked_auto_transfer_id uuid references auto_transfers(id)`,
following the same self-tagging pattern as `linked_bill_id`/`linked_debt_id`. A
"Process transfer" action writes a normal ADR-056 transfer pair (two cleared
transactions sharing `transfer_group_id`, debit on `from_account_id`, credit on
`to_account_id`) but tags **only the credit leg** with `linked_auto_transfer_id`. This
lets the existing `deriveCycleInfo()` ledger-state machinery (ADR-036) work unmodified —
it sums cleared amounts linked to the payable, exactly as it does for a bill's
single-sided payment — so an auto-transfer collapses naturally to two ledger states,
unpaid ("not yet processed") and cleared ("processed"), reusing the same 4-state
function without a partial/pending case ever firing.

`PayableKind` extends to `"bill" | "debt" | "auto_transfer"`, and `obligationsInRange()`
(ADR-060/080) gains a third loop over active auto-transfers so they count toward "due
this period" on Paycheck Budget and the Dashboard hero, and inherit ADR-080's "stays due
every period until processed" behavior for free.

Auto-transfers are deliberately kept visually and lexically separate from Bills/Debts
everywhere they surface (own section on the Bills screen, own Dashboard card, "🔁
Auto-transfer" kind tag on Paycheck Budget rows) and use softer "check on this" copy
instead of red past-due/arrears language when overdue, since nothing is actually owed to
a vendor — the transfer already happened at the bank; the app is just unconfirmed.

Reason:
Surfaced by the 2026-08-20/21 SoFi-Invest/Stash-Invest cleanup: both had been
mis-modeled as Bills to get a due-date reminder, but Bill payments are single-sided and
never credited the destination account, silently under-crediting it. ADR-056's Transfer
mode correctly double-enters the money but has no recurrence or reminder attached.
Logged as an unscoped gap in `docs/SCRATCHPAD.md` (2026-08-22) with the open question of
what "due"/"paid" means for a transfer with no external vendor — resolved here by
reusing the existing bill-scheduling and ledger-state machinery structurally, while
keeping the user-facing language honest about there being no vendor and no real
"overdue" money.

Status: Decided 2026-08-24. Schema migration run and confirmed live via the
read-only MCP. Code landed (data layer, Bills screen section, Paycheck Budget,
Dashboard card) — see the implementation note below for one deliberate
deviation from this decision's original wording. Not yet browser-verified
(Windows AppLocker blocks local `vite`/`tsc`); see docs/TODO.md.

Implementation note (2026-08-24): rather than extending the existing
`Payable`/`PayableKind`/`deriveCycleInfo` machinery in `payments.ts`/
`ledger-state.ts` to a third kind, auto-transfers got a parallel, dedicated
module (`src/lib/auto-transfers.ts`) instead. That existing machinery turned
out to be deeply bill/debt-specific (ternaries throughout for arrears/
partial/pending/fee logic that doesn't apply here), so threading a third kind
through it would have been a much larger, riskier change than the ADR's
original wording assumed. The dedicated module still reuses the same
ledger-state *pattern* (a `CycleInfo`-shaped return, the same due-window/
resolved-lookback logic, `stateVisual()` for presentation) — just as a
sibling implementation rather than an inline extension.

2026-08-26 addendum — "Process transfer" write order:
`useProcessAutoTransfer` originally advanced `auto_transfers.next_due_date`
first (mirroring ADR-037's "payable row before ledger"), then wrote the two
transfer legs. A failure on the credit-leg insert then left the due date
already advanced + an orphan debit + no `linked_auto_transfer_id` row, so the
cycle read as unpaid for the *next* period and the current one was silently
skipped. Reordered: both legs first, the `next_due_date` advance last. ADR-037's
rule is about not stranding an orphan transaction against an untouched balance;
here the "payable" write is a scheduling-date bump with no balance, so that
concern doesn't apply, and not skipping the cycle matters more. A failed date
advance now leaves a complete, correctly-tagged pair that
`deriveAutoTransferState` still reads as "cleared" (off the credit leg's
`resolved_cycle_due_date` tag) against the un-advanced date. Orphan-debit risk
on a failed credit leg is unchanged and still matches `useSaveTransfer`. No
schema change.

2026-08-26 addendum — code-review follow-ups (findings 2, 4, 5, 6):

- **"Processed / Undo" never appeared (finding 6, the real bug).** Processing
  advances `next_due_date` and tags the credit leg with the cycle it closed
  (one interval back). `deriveAutoTransferState`'s `eligible` filter drops any
  leg tagged earlier than the current due date, so a just-processed transfer
  flipped straight back to "unpaid" and lost its Undo affordance — and the user
  could immediately re-process, advancing the date again. Fixed: the
  resolved-cycle lookback now fires whenever `today < next_due_date` (was
  `today <= next_due_date - 1 interval`) and matches the credit leg's exact
  `resolved_cycle_due_date` tag against `linked` (not the filtered `eligible`).
  A processed cycle now reads "cleared" until its (advanced) due date arrives,
  then correctly returns to "unpaid" for the next cycle. Surfaced by the first
  unit tests for this module (`src/lib/auto-transfers.test.ts`).
- **Server-side double-process guard (finding 2).** Before writing,
  `useProcessAutoTransfer` queries for a cleared leg already tagged
  `resolved_cycle_due_date = at.next_due_date` and refuses if one exists —
  backstop for the same-cycle race the UI's client-only "hide button when
  cleared" doesn't cover.
- **Deterministic undo (finding 5).** `useUndoAutoTransferProcess` targets the
  leg tagged to the cycle `next_due_date` was just advanced past
  (`resolved_cycle_due_date = reverseDate(next_due_date)`), falling back to
  most-recent-by-date only for legs written before the tag existed. Two cycles
  processed the same day now undo in the right order.
- **Paused auto-transfers (finding 4).** The Bills-screen list rendered
  `is_active = false` rows with a live "Process transfer" button. They now show
  a dimmed card with a "Paused" pill and no action button (still editable to
  reactivate). `obligationsInRange` and the Dashboard reminders already
  excluded them.
- Not changed (finding 3): the processed transaction is still dated "today".
  Dating it at the (past) due date instead would fall outside
  `deriveAutoTransferState`'s half-open `d > openStart` window and break state
  detection — the today-date is load-bearing.

No schema change.

2026-08-26 addendum — RLS was missing on `auto_transfers`:
The original ADR-081 SQL block included an `enable row level security` +
`household access` policy for `auto_transfers`, but it was never run — the table
shipped with RLS DISABLED and zero policies. Any authenticated user could
read/write/delete any household's auto-transfer rows directly via PostgREST
(the app's own `useAutoTransfers` query filters by `household_id`, which masked
this). Fixed 2026-08-26 as part of ADR-083's RLS hardening
(`scripts/migrations/2026-08-26-rls-hardening.sql`): `enable row level
security` + `create policy "household access" ... using/with check
is_household_member(household_id)`, matching every other data table.

