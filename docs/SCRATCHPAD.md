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
- unable to edit transaction to add institution if transaction has a category split

---

## Idea: smarter institution_type for inline-created merchants (Add Transaction)

Currently addMerchant() hardcodes institution_type: "other" for any place created inline from Add Transaction. Works, but vague — no icon/type distinction from any other "other" institution.

Possible future enhancement: infer or prompt for a real type (subscription/utility/medical/etc.) at inline-creation time, so merchants captured this way get sensible icons/grouping like deliberately-added institutions do.

Not scoped. Not decided. If pursued, likely needs its own small ADR (touches UX + how institution_type/icon gets assigned) before a TODO line or Kiro prompt — see 2026-08-12 discussion on why this stays out of TODO.md for now.