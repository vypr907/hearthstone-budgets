## ADR-029: Category Visual Metadata (Icon, Color)

Decision:
Add `categories.icon text` and `categories.color text` (hex or Tailwind token).
Both nullable — existing categories without a value fall back to a default
icon/gray color in the UI rather than requiring a backfill.

Reason:
Matches the icon/color treatment already used for institution_type and the
visual language established in ADR-026. Purely additive display metadata,
no impact on category matching/grouping logic (ADR-011, ADR-012).

Status: Decided 2026-08-03. Implemented 2026-08-03 (/app/categories icon+colour
picker; icon + left-border colour accent on Categories and Spending rows,
falling back to a gray tag icon when null). CATEGORY_ICONS set expanded
2026-08-17 (30 → 54 options), then expanded again 2026-08-17 (54 → 77
options) — same picker component both times, no schema change.


