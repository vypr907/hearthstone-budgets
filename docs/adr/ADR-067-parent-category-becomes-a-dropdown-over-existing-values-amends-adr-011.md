## ADR-067: Parent Category Becomes a Dropdown Over Existing Values (Amends ADR-011)

Decision:
The Categories screen's Parent Category field becomes a dropdown/combobox
sourced from the household's own distinct existing `categories.parent_category`
values, with an inline "+ Add new" option for a genuinely new parent label.
`categories.parent_category` remains a plain text column — no
`parent_categories` table, no FK, no schema change. This only changes the
input widget from free text to constrained-choice-plus-create.

Reason:
ADR-011 kept parent_category as free text and leaned on a pre-insert
validation query to catch drift (e.g. "Gifts/Holidays" vs "Gifts &
Holidays"). That validation only runs at CSV import time, not during normal
in-app editing — so drift was always possible from the Categories screen
itself. A dropdown over existing values closes that gap directly, without
the FK/migration ADR-011 decided wasn't yet justified.

Status: Decided 2026-08-17. Implemented 2026-08-17 (Categories screen Parent
Category field: Select over distinct existing `parent_category` values, "None",
and inline "+ Add new" text entry).


