## ADR-088: Per-Account Owner (`accounts.owner_member_id`); Member-Scoped Spendable & Net Worth

Decision:
Add `accounts.owner_member_id uuid` (nullable, `references household_members(id)
on delete set null`). **Null = shared/joint** — the account folds into every
member's numbers. Non-null = personal to that member — it folds into only that
member's numbers.

```sql
alter table accounts
  add column owner_member_id uuid references household_members(id) on delete set null;
```

No new RLS policy. Both household logins keep full read/write on every `accounts`
row (ADR-002 shared visibility). `owner_member_id` changes only which accounts
fold into a viewer's *aggregates* — never what they can see or edit, and never
the ledger.

- `AccountDialog` gains a **"Belongs to"** select (`Joint` / each member's
  `display_name`) bound to `owner_member_id`, and an **"Include in net worth"**
  checkbox bound to the existing-but-unused `accounts.include_in_net_worth`
  column (same shape as the ADR-021 `is_spendable` checkbox).
- New `src/lib/household.ts`: `useHouseholdMembers()` (the household's member
  rows) and `useCurrentMember()` (the caller's row, resolved via `auth.uid()` —
  same pattern as `useMemberTheme` in `src/lib/theme.tsx`).
- New predicate `accountInMemberView(account, viewerMemberId)` in
  `src/lib/balances.ts`: `true` when `owner_member_id` is null, equals the
  viewer, or the viewer id is unknown (safe default → show everything).
- Applied to:
  - Dashboard **combined spendable** total and its checking / available-credit /
    savings breakdown (`src/routes/app.index.tsx`).
  - **Net worth** total and 6-month trend (`src/routes/app.index.tsx` →
    `netWorthTrend`), which additionally skips accounts with
    `include_in_net_worth === false`.
  - **Status Snapshot** balance subtotals and spendable total
    (`src/routes/app.snapshot.tsx` → `buildBalanceSubtotals`) — the report is
    "my picture", generated per-viewer.
- The Accounts screen (`src/routes/app.accounts.tsx`) lists **every** account
  regardless of owner, with an owner chip on the card and a new "Owner" entry in
  its filter row.
- Unchanged and still whole-household: `computeBalances`, per-account balance
  cards, the transactions ledger, `computeInstitutionTotals`, paycheck budget,
  arrears.
- All 15 existing accounts stay `null` (joint) after the migration — behavior is
  identical until an account is explicitly tagged.

This amends the `docs/SCHEMA.md` "Known Schema Rules → Never Add →
User-specific ownership columns on financial tables" rule: that rule guards
against per-user *RLS / row visibility*. A display-scoping tag that changes
nobody's access or edit rights is explicitly allowed — same reasoning as
ADR-061's per-user `household_members.theme` column.

Reason:
The two logins share all data (ADR-002), but in practice some checking / credit
accounts are effectively one person's. Summing all of them into one "combined
spendable" and one net worth overstates what either person can actually spend
and distorts the dashboard. A nullable owner tag lets each account be marked
personal or joint; a personal account drops out of the *other* member's
headline numbers while staying fully visible and editable to both, and the
shared ledger is untouched. `include_in_net_worth` already existed unused —
wiring it in the same change covers "keep this account off the trend" (a
tracking-only card, a locked HSA) without inventing a second concept.

Status: Decided 2026-08-27. Implemented 2026-08-27 (Issue #36, PR #39).

