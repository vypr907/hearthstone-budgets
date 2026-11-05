## ADR-023: Combined Spendable Total Uses Available Credit for Credit Accounts

Decision:
For accounts with account_type = 'credit', the combined spendable total uses available
credit (credit_limit - creditOwed(balance)) instead of raw balance. Checking accounts
continue to contribute their raw spendable balance (per computeBalances in balances.ts).
The per-account credit balance display (amount owed) is unchanged — this only affects
how credit accounts are folded into the combined total.

Reason:
A credit account's raw balance represents debt owed, not money available to spend. Summing
that directly with checking balances understated what's actually usable/available across
the household. Available credit is the meaningful "spendable" figure for a credit account.

Implementation notes:
- balances.ts's computeBalances() currently has no reference to credit_limit — the combined
  total calculation (wherever .spendable values are summed, outside this file) needs a new
  branch: for account_type = 'credit', use credit_limit - creditOwed(spendable) instead of
  spendable directly.
- creditOwed() already exists in balances.ts and is reused here, not duplicated.
- Requires credit_limit to be populated on all credit accounts (recently exposed in the
  account edit dialog) — an account with a null/0 credit_limit will compute available
  credit as 0 or negative; decide whether to treat null credit_limit as "exclude from
  combined total" or "treat as 0 available" before shipping.
- Does not change ADR-013's account inclusion rules (is_spendable = true AND account_type
  in ('checking','credit')) — only changes what value a 'credit' account contributes once
  included.

Status: Decided 2026-08-02. Implemented 2026-07-31 (null/0 credit_limit excludes the account
from the combined total).

