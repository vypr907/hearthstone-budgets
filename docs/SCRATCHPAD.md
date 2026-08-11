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
2. Update docs/TODO.md entries with work done since last update. If TODO item is checked off/completed, remove it. Document should only be current open items, not a history
3. Update docs/CONTEXT.md's "Current Status" phase list and any "Locked Decisions" /
   "Important Rules" sections that changed based on SESSION.md's content (e.g. new fields,
   new tables, new behavior). Keep CONTEXT.md's existing structure and brevity — it's meant
   to stay a compact briefing, not grow into a full changelog.

4. Once both files are updated, clear docs/SESSION.md back to an empty template (just a
   header, e.g. "## Session Notes" with no entries) so it's ready for the next work session.

Show me the diffs for all three files before finalizing.


# Things to work on
- Stranded debt payments found card on Debts still shows an issue with a debt, even though I fixed the payment and it correctly updated the balance.
- Spending: needs better formatting for mobile, more graphical, less text
- suggestions for adding Institutions when adding transactions. For example, I go to a new store "Bob's Burgers" and buy lunch. I want to add the transaction, and the form is there, but I also want to track the store/restaurant, but I want to keep the quick/easiness of the transaction add. IMPLEMENTED, BUT ERROR ON ADDING NEW INSTITUTION. Existing Institution works.
- On Paycheck Budget/Income, Sources should be more like cards, complete with detail view. Detail view should also list paydates from that source, Total income from this source (all time and current year), average income (monthly). On detail view, should be an option to Edit, and add splits. Example: my ASRC Federal paycheck actually goes to 3 different accounts as well as contributions to my retirement account, HSA, and LPFSA accounts. Upon marking recieved (or post deposits for existing pay dates), it should create transactions adding these amounts to the proper accounts. IMPLEMENTED, but I want the Deductions to be separate from splits. Example, my ASRC Federal paycheck is 3160 with splits to 3 accounts. I have HSA deductions of 140 and LPFSA of 50, but they come out before the paycheck amount. (the amount listed in app is NET, after deductions)
- when adding a Pay date, I now have the option to Post deposit after saving, but it should be automatic for new Pay date entries
- want to be able to add transfers between accounts, and handle Advances. Example, take an advance of 50 from MoneyLion, adds transaction of 50 to selected account, and updates the debt amount. Payments appropriately take amount from payment account to debt account
- when adding a fee to a payment, then marking the payment as cleared, it does not update the fee transaction to cleared as well
- when paying overdue bills/debts, include options to pay "owed this cycle", "total due", or "other amount"
- on bills detail view, no way to add fees/adjustments. need a way to separate fees/adjustments/etc that affect the balance and those that don't. Example, a late fee on a bill, adds to the balance. But a processing fee for a rent payment doesn't affect the balance at all
- when submitting a payment, any click on the "how much are you paying now?" screen opens the bill detail view. Have to use tab in order to enter values.
- also, when paying an overdue bill, it doesn't seem to count against the overdue amount.
- need more sort/group/filter options for Transactions, also on Dashboard and Spending, should be a way to view all transactions for that Category/Budget Item

---
- unable to edit transaction to add institution