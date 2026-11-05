## ADR-028: One-Page Status Snapshot Export

Decision:
Add a printable "Status Snapshot" view — a single-page, visual summary of household
financial status as of the current moment — exportable as an image (default) or PDF.
Add `households.export_format text not null default 'png' check (export_format in
('png','pdf'))` as a shared household setting, editable from a Settings screen. No
other schema changes; the report is composed entirely from existing tables (bills,
debts, income_events).

Report contents (all read-only, computed live at export time):
- Bills & Debts list with current payment_status, grouped by status (overdue first)
- Overdue amount total, and per-item overdue amount (effective due date < today,
  not cleared)
- Upcoming bills/debts due within the next 14 days from report date
- Next primary pay date (soonest primary income_event with expected_date >= today,
  per ADR-024)

Reason:
A quick, shareable "where do we stand right now" view is useful for a 2-person
household without either person opening the full app. Since both users already
see identical shared data, a single export format setting at the household level
(not per-user) is enough — this isn't a personal preference, it's about which
format is easiest to share/print for this household.

Implementation notes:
- Render as a normal React component (reuse existing card/typography components
  from ADR-026's viz.tsx where they fit) sized for a single printable page.
- Export via html2canvas → PNG by default. When export_format = 'pdf', pipe the
  same canvas through jsPDF as a single-page PDF instead of a second parallel
  implementation.
- Report date is always "now" — no historical/backdated report in this version.
- "Upcoming" window is a fixed 14 days for this first version, not user-configurable.

Status: Decided 2026-08-03. Implemented 2026-08-03 (/app/snapshot + /app/settings). Uses html2canvas-pro (drop-in html2canvas fork) because html2canvas 1.4.1 cannot parse the app's oklch color tokens.

### Addition 2026-08-06
Decision: The snapshot also renders (a) a Balances card with per-account-type subtotals plus
the ADR-023 combined spendable total, (b) a pay-period progress bar of covered vs. still owed
for the current pay period (calendar month fallback), and (c) a rule-based text summary from
`buildSnapshotSummary()` in src/lib/snapshot.ts.
Reason: The one-page export needed context (what's in the accounts, how far through the period
we are) rather than only a due list. The summary is isolated in one pure function with plain
string templates so an LLM-generated version can replace it without touching the UI.
Status: Decided 2026-08-06. Implemented.

