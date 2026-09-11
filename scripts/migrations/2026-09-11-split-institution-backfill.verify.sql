-- Verify 2026-09-11-split-institution-backfill.sql.

-- Expect 8 rows, each with the institution name noted.
select t.id, t.split_group_id, t.amount, i.name as institution
from transactions t join institutions i on i.id = t.institution_id
where t.id in (
  '9b59a535-b955-444f-b1b6-6348adf84459','0bb49954-7935-4c8f-a922-d9435acb6640',
  'd88fd480-7b76-4af4-89b8-2ffe08b396f9','d31f3371-0e08-4bb8-80e9-cc5dfae069d9',
  '77300575-57d9-480e-8742-2c336f24346c','3101f598-3b26-4854-b591-8a97044ab16a',
  'bcc8089a-99be-44ac-9a79-a0fdc1ce3e95','ae60483c-243a-4939-8e32-3a5e658567cf'
)
order by t.split_group_id;

-- Confirm no other split rows were touched (expect 27 -- the paycheck/
-- deduction splits, left alone since they already show a description).
select count(*) from transactions
where split_group_id is not null and institution_id is null
  and household_id = 'cd8bce8c-81af-4302-8019-113e352ed443';
