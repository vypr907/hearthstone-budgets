## ADR-011: Parent Category Stays a Text Column (For Now)

Decision:
categories.parent_category remains a plain text column. No parent_categories table
or join table is introduced at this time.

Reason:
Considered normalizing parent_category into its own table (parent_categories) with
categories.parent_category_id as an FK, to eliminate naming-drift bugs (e.g. the
"Gifts/Holidays" vs "Gifts & Holidays" mismatch hit during Phase 4 import) and to
support future parent-level metadata (color, icon, display order) for charts.

For a 2-person household app, the drift risk is adequately handled by the existing
pre-insert validation query (compare sheet parent labels against seeded
parent_category values before import) and is not frequent enough to justify a
migration right now. Chart/analysis grouping by parent_category already works fine
as a plain text `group by` — a join table adds no query capability that doesn't
already exist, only integrity and future metadata support.

Revisit when: parent category renames become frequent, or the "sell this as a
product" path (see PLAN.md's Future Add-On section) becomes real — multi-household
FK integrity matters more once other households' data is involved.

See PARENT_CATEGORY_MIGRATION.md for the exact steps to take when this is revisited.

### Spending groups use categories.parent_category as plain text
categories.parent_category is a text label, not a FK. Grouping on the Spending screen keys off the trimmed text ("Ungrouped" when empty) rather than looking up another categories row.

Status: Decided 2026-07-30. Not implemented.

