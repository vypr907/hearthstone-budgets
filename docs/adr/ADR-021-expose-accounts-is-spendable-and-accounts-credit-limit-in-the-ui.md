## ADR-021: Expose accounts.is_spendable and accounts.credit_limit in the UI

Decision:
The account add/edit dialog includes a "Spendable" checkbox bound to `accounts.is_spendable`
and a "Credit limit" currency input bound to `accounts.credit_limit`. The credit-limit field is
only shown when `account_type` is "credit" and is stored as `null` for non-credit accounts.
Balance computation (`src/lib/balances.ts`) is unchanged; this only exposes existing columns.

Reason:
These columns existed in the schema and were already used by spending-balance and net-worth
calculations, but they had no UI affordance, so users couldn't actually maintain them.
Credit limit is only meaningful for credit accounts, so hiding it for other types keeps the
form simple and avoids accidental data entry.

Status: Decided 2026-07-31. Implemented.

**2026-08-27 addendum — expose `accounts.account_number` too:**
The account add/edit dialog gains an "Account / card number" text input bound to
`accounts.account_number` (nullable, stored as `null` when blank, not trimmed of
digits on write). Same rationale as the original ADR: the column already exists
(added 2026-07-28) and `accountLast4()` / `accountLabel()` (`src/lib/format.ts`)
already render only its last 4 digits (`•••1234`) in account pickers and pills —
there was just no way to enter it. The Accounts screen (`src/routes/app.accounts.tsx`)
also now shows `···1234` after the account name. Balance logic unchanged. An
account still represents both the account and its card; no separate `cards`
table (see `docs/SCRATCHPAD.md` "Things to work on"). Implemented 2026-08-27 in
`src/components/AccountDialog.tsx` + `src/routes/app.accounts.tsx`.

