## ADR-107: Transfers to an Untracked Personal Account Count as Spend

Decision:
New `accounts.transfers_count_as_spend` (boolean, default `false`). When an
account carries this flag, ADR-089's "two-sided transfer is never spend"
rule no longer applies the same way for a transfer touching it:

- A transfer whose RECEIVING leg lands on a flagged account is no longer
  treated as internal at all — the sending leg (on a normal, tracked
  account) counts as real spend, same as money that actually left the
  household. `internalTransferIds()` (`src/lib/internal-transfers.ts`)
  gained an optional second argument, the set of flagged account ids
  (built by the new `opaqueTransferAccountIds(accounts)` helper), and
  excludes a `transfer_group_id` from its returned "internal" set once the
  positive leg's `account_id` is in that set.
- The reverse direction — a transfer whose SENDING leg is the flagged
  account, i.e. money coming back — deliberately stays a neutral, excluded
  internal transfer for now, not "income." Every spend calculator in this
  codebase only ever recognizes negative amounts as spend; none has an
  "income" counterpart a transfer leg could feed into without a genuinely
  new feature. Treating the reverse leg as spend too (the naive symmetric
  option) would have been actively wrong — money coming back isn't an
  expense. Properly crediting it as income is deferred (see Issue backlog).
- Threaded through every spend-total call site that already had ADR-089
  awareness: `actualByCategoryInRange`/`combinedActualByCategory` (Dashboard,
  Simple view, Year in Review), `buildActualResolver` (Spending, Paycheck
  Budget spend history), Spending by Place, Fix Places, and the Transactions
  screen's "hide internal transfers" filter — each now computes
  `opaqueTransferAccountIds(accounts)` once and passes it through, so the
  behavior is consistent everywhere spend is totaled, not just on one screen.
- New toggle on `AccountDialog`: "Not fully tracked — count transfers as
  spend," off by default on every existing and new account (zero behavior
  change until explicitly turned on).
- `scripts/migrations/2026-09-17-transfers-count-as-spend.sql` (user-run):
  adds the column and flags the household's two known not-fully-tracked
  accounts (Steph One Checking, Cash — Stephanie) `true`. Data-only besides
  the new column; retroactive by construction, since `internalTransferIds()`
  is recomputed fresh from live data on every render — no backfill of
  historical rows needed.

Reason:
Interviewed after the user noticed a transfer to a personal account was
being excluded from spend the same as any internal transfer, and explained
why that's wrong for their situation: they don't have full visibility into
their spouse's personal accounts yet (a temporary state, not permanent), so
money that lands there is functionally gone from what this household's
ledger can account for — closer to spend than to a same-household wash. A
per-account toggle was chosen over hardcoding "spouse's accounts" so the
household can flip it off per-account once that visibility gap closes,
with no code change needed. Symmetric "reverse counts as income" was the
user's first choice but reversed after discovering the app has no income
computation path a transfer leg could join without a separate, larger
feature — asymmetric (only the outgoing direction affected) was chosen
instead as the safe, buildable-today behavior.

Status: Decided 2026-09-17. Implemented 2026-09-17. Not yet checked in a
running browser; SQL migration not yet applied — user runs it manually.

