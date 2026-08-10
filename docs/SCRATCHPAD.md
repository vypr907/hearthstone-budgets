# Features I want
- [x] [high] per-paycheck budgeting
- [x] [med] future budgeting
- [ ] [med] bill calendar (sync with Google calendar)
- [ ] [low] tracking for side income, like UberEats driving
- [x] [high] be able to handle partial payments and payment reversals
- [x] [med] bill/debt that is pending should not show 'Submitted' button
- [ ] [low] simple AI chatbot to help answer questions, generate summaries, guide user around the app, etc
- [ ] [low] sync with banks like Rocket or Tilt
- [ ] [high] ability to add fees/extras
- [x] [high] generate 1 page reports
- [ ] [low] colour themes customization
- [ ] [med] ability to add PDF/image receipts
- [ ] [med] ability to split transactions
- [ ] [med] ability to add invoices (treat as debts?)
- [ ] [high] ability to split paycheck to accounts | marking income as received adds transaction to appropriate account

# Views
- [x] bill detail
- [x] institutions - category icons / capitalization / group by / linked bills/debts
- [ ] account detail
- [ ] 



# Next Lovable prompt


# Next Steps




# Daily Summary prompt
Read docs/SESSION.md, docs/CONTEXT.md, and docs/CHANGELOG.md.

1. Summarize the changes logged in SESSION.md into new dated entries appended to
   docs/CHANGELOG.md, following its existing format (## <date> – <short title>, then
   ### Completed / relevant subsections). Don't rewrite or reformat CHANGELOG's existing
   entries — only append new ones for what's in SESSION.md. If there are any entries left in ## Backlog section, be sure to add/update them in docs/TODO.md
2. Update docs/TODO.md entries with work done since last update.
3. Update docs/CONTEXT.md's "Current Status" phase list and any "Locked Decisions" /
   "Important Rules" sections that changed based on SESSION.md's content (e.g. new fields,
   new tables, new behavior). Keep CONTEXT.md's existing structure and brevity — it's meant
   to stay a compact briefing, not grow into a full changelog.

4. Once both files are updated, clear docs/SESSION.md back to an empty template (just a
   header, e.g. "## Session Notes" with no entries) so it's ready for the next work session.

Show me the diffs for all three files before finalizing.


# Things to work on
- need to a way to track overdue amounts.. not just that a bill/debt is overdue, but by how much.. for bills/debts that may be more than 1 month past due. THIS HAS BEEN IMPLEMENTED, but only for new debts. Need a way to add/correct arrears for existing debts
- for adding a debt of type Invoice, want the name to auto-populate with "Institute - <INVOICE NUMBER>" - will need a new field for Invoice number
- Stranded debt payments found card on Debts still shows an issue with a debt, even though I fixed the payment and it correctly updated the balance.
- Spending: needs better formatting for mobile, more graphical, less text
- suggestions for adding Institutions when adding transactions. For example, I go to a new store "Bob's Burgers" and buy lunch. I want to add the transaction, and the form is there, but I also want to track the store/restaurant, but I want to keep the quick/easiness of the transaction add. Also is there a way to automatically populate the icon/logo for a new institution like this? I eventually want a screen to show where money is going by institution (see screenshot)