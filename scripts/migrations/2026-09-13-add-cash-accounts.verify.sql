-- Verify 2026-09-13-add-cash-accounts.sql.

select name, account_type, is_spendable, include_in_net_worth, owner_member_id, institution_id
from public.accounts
where account_type = 'cash'
order by name;
-- expect 2 rows: "Cash — Stephanie" (owner 545e684e-...), "Cash — You" (owner f93a0ac9-...)
-- both is_spendable=true, include_in_net_worth=true, institution_id null
