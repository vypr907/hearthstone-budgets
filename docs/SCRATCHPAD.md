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
Implement ADR-060 (recurrence projection for forward-looking pay periods)
exactly as decided — do not create a new ADR, do not touch computeArrears
or any stored due-date field. This is purely additive to the Paycheck
Budget screen's display logic.

IMPORTANT — credits are limited and this may not finish in one pass. After
EACH numbered step below, append a short note to docs/SESSION.md stating
exactly which step just completed and which files changed, before moving to
the next step. If you have to stop before finishing all steps, the last
SESSION.md note must say which step is next, so work can resume in Kiro or
a future Lovable session without re-deriving context.

Steps:

1. Find the existing function that advances a bill/debt's due date forward
   by one billing_cycle interval (used when a payment clears a cycle —
   likely in src/lib/payments.ts or src/lib/dates.ts). Do not write new
   interval math — reuse this function's logic directly or by calling it.
   → Checkpoint: note in SESSION.md which function you found and where.

2. Write projectOccurrences(item, throughDate): starting from the item's
   current next_due_date (bills) or computed due date (debts, ADR-017),
   repeatedly advance by one cycle using the function from step 1,
   collecting each resulting date, until the date exceeds throughDate.
   throughDate = the end of the last pay period the household has an
   entered future pay date for.
   → Checkpoint: note in SESSION.md that this function exists and is
   unit-testable in isolation (don't need to wire it into the UI yet to
   verify it produces correct dates for a monthly and a biweekly item).

3. Wire this into obligationsInRange() (or wherever the Paycheck Budget
   screen assembles its period data): for periods beyond an item's current
   unpaid occurrence, call projectOccurrences and bucket each result into
   whichever period's date range it falls into, using the same half-open
   start <= d < end comparison already used for real due items.
   → Checkpoint: note in SESSION.md that projected items now appear in the
   period data, even if UI styling isn't done yet.

4. UI: give projected line items a visual marker (e.g. a "Projected" badge
   or muted/dashed styling) distinguishing them from real due items in the
   "Due this period" card. Both count toward the period total/left-to-
   allocate math (ADR-039) — do not exclude projected amounts from totals.
   → Checkpoint: final SESSION.md note confirming all 4 steps done.

Do not touch: computeArrears, next_due_date/due_day storage, ADR-059's
manual-planning feature (separate, unrelated addition), or variable-amount
bill forecasting (projected amount = the item's current stored amount,
no attempt to predict drift).

Test: select the pay period ending 9/24 (currently shows nothing due) and
confirm previously-invisible recurring bills now appear there, marked as
Projected, with correct dates one cycle after their current next_due_date.

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

## Future: In-app theme color editor
Per-user editable overrides on top of the base theme (color pickers per token,
live preview, reset-to-default). Likely needs `household_members.theme_overrides
jsonb` layered over the base theme CSS. Bigger scope than the ADR-061 preset
themes — worth its own ADR once fonts/icons are also editable, so the editor
covers more than just 5-6 color swatches. Not scoped or decided yet.


# Theme notes
## Halo
Color PaletteBackground: Deep space black (#0B0E14) or dark slate gray.Primary Accent: Energy blue/cyan (#00F0FF) or UNSC tactical green (#39FF14).Warning/Alert: Plasma orange (#FF5500) or yellow.Text: Crisp white or muted ice blue.Typography & GeometryFont: Clean, geometric sans-serif or bold DIN/stencil fonts for headers.Shapes: Angular corner cuts, thin grid lines, and diagonal data blocks instead of standard soft rectangles.Containers: Semi-transparent frosted glass (backdrop-filter: blur) with thin glowing borders.Key UI ComponentsHUD Banners: Top and bottom status bars styled like a Spartan helmet display with system stats, battery bars, and coordinate markers.Buttons: Flat shapes with corner notches that brighten and project a subtle outer glow on hover or tap.Loading Spinners: Rotating sci-fi tech rings, radar sweeps, or data-loading percentage counters.Data Panels: Monospace numbers paired with small hazard stripes or loading segment bars.

https://www.figma.com/community/file/1168619846377132193/halo-infinite-ui-rework


## Hello Kitty
🎨 Exact Hex Color CodesClassic Bow Red: #E60012Hello Kitty Pink: #FFB7D5Pastel Blush: #FFE5ECAccent Yellow: #FFF100Clean White Backgrounds: #FFFFFF

## Purple
🎨 Purple Theme Color PalettesChoose the vibe that best matches your style:Option A: Deep Amethyst (Dark & Premium)⬛ Midnight Plum (Background): #120E16💜 Deep Amethyst (UI Containers): #2A1B3D🔮 Vibrant Violet (Accents & Toggles): #A64B2A◽ Lavender Frost (Text & Icons): #E8DFF5Option B: Soft Lavender (Pastel & Minimalist)⬜ Clean Lavender Chalk (Background): #F3EFF5🪻 Muted Lilac (UI Accents): #D8B4F8💟 Orchid Pink (Highlights): #F1C6E7⬛ Dark Charcoal (Text): #232124

## Cyber
🎨 Cyber & Modern Color PalettesChoose between a vibrant cyberpunk look or a clean, stealthy modern-military style:Option A: Neon Cyberpunk (High Contrast)⬛ Deep Void (Background): #08090C🩵 Laser Cyan (Accents): #00F5FF💜 Electric Magenta (Highlights): #BD00FF◽ Matrix White (Text): #E2E8F0Option B: Stealth Modern (Minimalist Tech)⬛ Matte Carbon (Background): #121212🟩 Tactical Green (Accents): #00FF66🎛️ Control Gray (UI Elements): #2A2D34◽ Clean Silver (Text): #F8FAFC


