# Features I want
- [ ] [high] per-paycheck budgeting
- [ ] [med] future budgeting
- [ ] [med] bill calendar (sync with Google calendar)
- [ ] [low] tracking for side income, like UberEats driving
- [ ] [high] be able to handle partial payments and payment reversals
- [ ] [med] bill/debt that is pending should not show 'Submitted' button
- [ ] [low] simple AI chatbot to help answer questions, generate summaries, guide user around the app, etc
- [ ] [low] sync with banks like Rocket or Tilt
- [ ] [high] ability to add fees/extras
- [ ] [high] generate 1 page reports
- [ ] [low] colour themes customization

# Views
- [x] bill detail
- [ ] institutions - category icons / capitalization / group by / linked bills/debts
- [ ] account detail
- [ ] 

# Next Lovable prompt

Add a new "Paycheck Budget" section, separate from the existing monthly Spending screen —
don't touch spending_budgets or spending_actuals.

New tables (already created in Supabase, RLS already applied): income_sources,
income_source_splits, income_events, pay_period_allocations. income_sources.is_primary marks
the one primary job (only one can be true). income_source_splits defines how one primary
paycheck deposits across accounts (fixed amount + day_offset, or a single 'remainder' split for
whatever's left) — show these as read-only info on the paycheck detail view, not editable here.

Build a screen where I can:
1. Pick a pay date (a primary income_event, expected or actual)
2. See that period's range: this event's date up to the next primary income_event's date
   (or +14 days if the next one doesn't exist yet)
3. See all bills and debts whose effective due date falls in that range (reuse existing
   due-date logic — debtDueDate() for debts, the existing bill cycle/next_due_date fields for
   bills), listed with their amount (bills: cycle_amount_due if set, else amount; debts:
   minimum_payment), and a total
4. See any secondary income_events (non-primary sources) whose date falls in that same range,
   added as extra available money for the period
5. Below that, one row per spending category with a slider/input to set
   pay_period_allocations.allocated_amount for this income_event + category
6. At the bottom, a running total: (primary amount, using actual_amount if received else
   expected_amount) + secondary income in range − obligations total − sum of allocations.
   Show it large: green/zero-centered when 0, red when negative (over-allocated), and show the
   positive amount in blue/neutral when there's still room to allocate.

Also add a simple form to create income_sources (name, cadence, is_primary, typical_amount) and
income_events (source, expected_date, expected_amount, mark received with actual_date/amount).
Don't build income_source_splits editing yet — just display it if rows exist for the primary
source.
Two additions to the Paycheck Budget screen:

1. The pay-date picker should list ALL primary income_events (past and future, expected or
   received), not just the next upcoming one — let me create a future income_event and set
   its allocations ahead of time for planning purposes.

2. Add a "Paycheck Trends" view: a line or bar chart per category showing allocated_amount
   across income_events over time (x-axis = event date, one series per category, or a
   stacked bar per paycheck). Pull from pay_period_allocations joined to income_events,
   ordered by expected_date. Include a simple table view as an alternative to the chart.
