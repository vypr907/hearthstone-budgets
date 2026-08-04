## Session Notes

- Paycheck screen: Allocations list is now grouped by parent category, with each
  row showing the category's icon and colour accent (left border + tinted icon
  tile) via `categoryVisual()` (ADR-029). UI only — no schema or budget-logic
  changes. Groups sort alphabetically, "Ungrouped" holds categories with no
  parent_category.
