## ADR-114: Per-Line Place for Split / Cash Back Entries

Decision:
A split transaction (ADR-044) or a "Cash Back" combo entry (ADR-103) had
exactly one institution ("place") for the whole entry — each line already
got its own category and tags (`SplitRow`, ADR-104) but not its own place.
`SplitRow` (`src/components/SplitLinesEditor.tsx`) gains `institutionId:
string | null`; the editor renders a per-row place picker next to the
existing per-row `TagPicker`. Both write paths that build rows from a
`SplitRow`/`SplitLine` array — `insertCashBackPurchaseRows`
(`src/lib/payments.ts`) and `useSaveSplitTransaction`
(`src/lib/data-hooks.ts`, whose `SplitLine` type gained the same field) —
now resolve each row's `institution_id` as `line.institutionId ??
<the entry's existing shared institutionId> ?? null`: a blank line falls
back to the entry's own top-level place picker, the same fallback
convention `submitTransfer`'s fee leg already uses
(`feePlaceId ?? fromAccount?.institution_id ?? null`). No schema change —
`transactions.institution_id` was already a plain nullable column on every
row; the gap was purely in the write-path functions always stamping one
shared value onto every generated row.

`PlacePicker` (`src/components/PlacePicker.tsx`) already had an unused
`compact` prop, but it's a block-level search/suggest UI (full-width input
+ inline suggestion chips) never built for a tight inline row. Rather than
cram that inline, a new `CompactPlacePicker` (local to
`SplitLinesEditor.tsx`) wraps it in a `Popover`, mirroring `TagPicker`'s
own `compact` mode exactly (small icon-button trigger, the real picker UI
floats instead of pushing the row's layout around). Each split row also
moved from one single-line flex row to a bordered two-line card (category
+ amount + delete on line 1; tags + place on line 2) to keep the row from
overflowing on phone width now that it holds two pickers instead of one.

`app.transactions.tsx`'s `SplitTransactionDetail` (the plain-split edit
dialog) seeds `institutionId` per line from each line's own
`transaction.institution_id` when the edit form opens, and carries it
through on save — same reasoning as its existing `tagIds` seed: `saveSplit`
deletes and re-inserts every line on save, so anything not carried forward
here is lost. Its read-only "Category lines" summary now also shows each
line's place (🏪 name) alongside its category. Cash Back purchase-line
groups don't go through this dialog at all — `assertCategorySplitGroup`
already excludes them (a Cash Back group's `split_group_id` doubles as a
transfer's `transfer_group_id`; ADR-103's own "Not covered" section says
those rows are edited individually through the normal single-transaction
edit dialog instead) — so no edit-path change was needed there; a Cash
Back purchase row's place was already editable post-creation the same way
any transaction's place is.

Reason:
Motivating case: an ATM withdrawal (cash + a Cash Back combo entry) often
carries two *separate* fees from two *different* places — e.g. $3 from the
ATM operator and $2.50 from the card network itself — and there was no way
to attribute them to their own institutions; they had to be lumped into one
fee line under one shared place. This is the exact scenario manually
patched via raw SQL in the 2026-11-03 Venmo reconciliation migration
(Nature's Releaf ATM fee + Cash App network fee as two separate lines with
two separate `institution_id` values) — this feature makes that supported
in the UI going forward instead of needing a migration each time. Per-line
institution granularity was never discussed in ADR-044, ADR-103, or
ADR-104 when those features were designed — not explicitly deferred, not
ruled out, simply not on the table; the single shared `institutionId` param
in both write paths was an oversight, not an intentional constraint.

Status: Decided 2026-11-04. Implemented 2026-11-04 — `tsc --noEmit` clean,
283/283 tests pass (no new pure logic needing its own fixtures; this is a
UI + write-path field addition with existing fallback behavior preserved
for every pre-existing row). Not yet checked in a running browser.

---

