## ADR-104: Tags — Many-to-Many Labels on Transactions (and Split Lines)

Decision:
Add a free-form tagging system: a `tags` table (household-scoped, name +
optional icon/color, ADR-029 convention) and a `transaction_tags` join table
(`transaction_id`, `tag_id`, composite PK, both FKs `on delete cascade`) —
the exact shape ADR-005 already established for `institution_categories`.
A tag can be applied to any transaction, including one specific line of a
multi-line split (each split line is already its own row in `transactions`
sharing `split_group_id`, so no new sub-row concept is needed — tagging a
line is just a `transaction_tags` row against that line's own id). A
transaction/line may carry any number of tags (chip multi-select, not a
single dropdown). A new `/app/tags` screen shows a running total + linked
transaction list per tag, and lets a tag be created/edited/deleted.

Tags are pure labels for v1 — no budget/target amount. That can be added to
the `tags` table later (e.g. a nullable `target_amount` column) without
reshaping this schema.

Reason:
User's motivating case: tracking a one-off cost (a friend's wedding dry
cleaning) that doesn't fit the existing category model — the expense is
legitimately "Dry Cleaning" by category, but the user also wants to see it
(and everything else tied to that event) totaled together. The same
mechanism generalizes to tax-deductible tracking, medical-expense tracking,
and per-trip spend — all cases where a transaction belongs to a real
spending category AND a cross-cutting label, and a single FK can't hold
both. Splits need line-level tagging specifically because a single register
swipe can mix a tagged purchase (e.g. wedding ribbon) with an untagged one
(a snack) in the same transaction.

`institution_categories` (ADR-005) already proved this exact many-to-many
join-table shape works well in this codebase for "one thing can have several
of another thing" — reused rather than inventing a new pattern. Scoping
`transaction_tags` reads by the household's own (small) `tag_id` list rather
than by a potentially-large `transaction_id` list avoids the row-limit class
of bug just fixed in `useTransactions()` this same session (PostgREST's
default 1000-row cap on an unpaginated select).

`useSaveSplitTransaction` deletes and re-inserts every line of a split on
every edit (the same mechanism that silently dropped `institution_id` on
split edits before the 2026-09-13 fix) — tag ids are re-attached by the
split editor on every save using each line's *current* tag selection
(seeded from the existing rows when the edit form opens), so an edit never
silently drops previously-applied tags.

Status: Decided 2026-09-15. Implemented 2026-09-15.

ADR-104 addendum (2026-09-17) — tagging extended to Transfer and Cash Back creation:

Decision:
Tags were only wired into the Add Transaction dialog's shared expense/
income/split branch — the "Transfer" and "Cash Back" modes each have their
own JSX branch in `AddTransactionFab.tsx` and never reached the `TagPicker`,
so neither could be tagged at creation at all (not a deliberate exclusion,
just missing). Fixed for both, with the granularity interviewed rather than
guessed:

1. **Transfer**: one `TagPicker` for the pair, applied to BOTH legs —
   a transfer is conceptually one movement, so a tag search finds it
   regardless of which leg (or account) it's looked at from.
   `useSaveTransfer` (`src/lib/data-hooks.ts`) takes an optional
   `tagIds?: string[]`, writes `transaction_tags` rows against both
   inserted legs' ids once they exist (a plain insert, not the diffing
   `useSetTransactionTags` does, since these are brand-new rows with
   nothing to diff against).
2. **Cash Back**: tags apply to the categorized purchase line(s) only —
   the withdrawal-to-Cash leg itself stays untagged, matching how it's
   already excluded from spend totals as an internal transfer (ADR-089).
   `cbPurchaseRows` already reused `SplitLinesEditor`/`SplitRow`
   (`tagIds` per line, ADR-104's own split-line tagging), so the picker
   was already on screen — `submitCashBack` just wasn't forwarding
   `r.tagIds` into `purchaseLines`. `insertCashBackPurchaseRows`
   (`src/lib/payments.ts`) now `.select("id")`s the inserted purchase
   rows and attaches each line's tags by index, the same
   insert-then-correlate pattern `useSaveSplitTransaction` already uses.

Reason:
Interviewed rather than assumed: a transfer's two legs are one user-facing
event, so splitting the tag between them would make a tag-based search miss
half of it depending on which account you're looking from. A Cash Back
withdrawal leg is deliberately excluded from spend already (ADR-089) — most
tag use cases are spend-tracking (tax-deductible, per-trip, etc.), so
tagging the never-spend withdrawal leg too would double-count it whenever a
tag's total is summed by transaction.

Status: Decided 2026-09-17. Implemented 2026-09-17.

