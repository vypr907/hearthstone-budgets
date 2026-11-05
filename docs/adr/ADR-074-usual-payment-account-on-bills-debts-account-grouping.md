## ADR-074: Usual Payment Account on Bills/Debts (Account Grouping)

Decision:
Add nullable `usual_payment_account_id uuid references accounts(id)` to both `bills` and
`debts`. A manual picker on each item's edit form lets the household record which account a
bill/debt is normally paid from. When the field is unset, the form defaults it once (not
resynced afterward) from the most recent transaction linked to that bill/debt
(`linked_bill_id`/`linked_debt_id`) if one exists — otherwise it stays null until set by hand.
Powers a new "Group: Account" mode in Paycheck Budget's "Due this period" toggle (alongside
the Due Date default and the Category mode shipped under ADR-073's work), showing subtotals
per account so the household can see how much needs to be in each account to cover what's due.

Reason:
Neither bills nor debts store any link to "the account this usually gets paid from" —
`institution_id` records the payee/merchant, not the household's own paying account. A manual
field beats trying to infer it fresh on every render from ledger history (unreliable/empty for
items never paid yet), while still saving a first guess from history so existing items with
payment history aren't blank by default.

Schema:
```sql
alter table bills add column usual_payment_account_id uuid references accounts(id);
alter table debts add column usual_payment_account_id uuid references accounts(id);
```

Migration steps:
1. Run the SQL above (Supabase SQL Editor, no CLI), then `notify pgrst, 'reload schema';`.
2. Backfill existing bills/debts that have payment history, one-time script:
   ```sql
   update bills b set usual_payment_account_id = (
     select t.account_id from transactions t
     where t.linked_bill_id = b.id order by t.transaction_date desc limit 1
   ) where b.usual_payment_account_id is null;

   update debts d set usual_payment_account_id = (
     select t.account_id from transactions t
     where t.linked_debt_id = d.id order by t.transaction_date desc limit 1
   ) where d.usual_payment_account_id is null;
   ```
3. Add the field to the Bill/Debt edit forms (manual picker), defaulting new/unset items to
   the most recent linked-payment account when one resolves.
4. Add "Group: Account" as a third option in Paycheck Budget's obligations toggle, with an
   `obligationsByAccount` memo mirroring `obligationsByCategory` (ADR-073-adjacent work).

Status: Decided 2026-08-19. Not yet implemented — pending sign-off before the SQL above runs.

