## ADR-090: Fix Places covers every fixable place-less row
Decision:
Fix Places (`src/routes/app.fix-places.tsx`) now surfaces every money-out
transaction with no `institution_id` except legs of an internal (two-sided)
transfer, which have no merchant by definition (ADR-056/089). Split lines
(ADR-044) and one-sided transfer legs are included — a split line is an
ordinary purchase and often happened somewhere different from the rest of its
group, and a one-sided leg means money left the household. Spending by Place
applies the same internal-transfer exclusion to both its rankings and its
"no place attached" footnote, and the footnote links to Fix Places with the
count of rows it can repair.

Reason:
Spending by Place reported $14,238.72 of place-less August spending while Fix
Places showed none of it: $12,522 was internal transfer legs (never fixable)
and $1,650 was split lines (fixable, but filtered out). The two screens have to
count the same rows, or the footnote is an unactionable alarm.

Status: Decided 2026-08-31. Implemented.

