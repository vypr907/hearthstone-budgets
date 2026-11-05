## ADR-053: Transactions carry an institution (place)
Decision: `transactions.institution_id` records where money was spent. Add
Transaction suggests matching places as you type the description, one tap links
the entry, and an unknown place can still be saved inline (auto-favicon) and is
linked immediately. Writes tolerate the column being absent.

Reason: Groundwork for a "spending by place" view, captured at entry time without
slowing the quick-add flow.

Status: Decided 2026-08-11. Implemented (view pending). 2026-08-17: manual/
generic transactions (no linked_bill_id/linked_debt_id, no "Fee: " description)
title themselves from place instead of a generic "Transaction" fallback —
see ADR-063 addendum.

