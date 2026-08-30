# Debts detail: fix horizontal fit + unscrollable Edit dialog

Two bugs in `src/routes/app.debts.tsx`, both presentation-only. No ADR, no schema.

## 1. Edit dialog extends past the window and can't scroll

**Root cause:** `DebtDialog`'s `DialogContent` (line ~990) uses the shadcn default with no height cap and no `overflow-y-auto`. Radix locks body scroll while a dialog is open, so the tall form (name, balances, cycle, deduction, plan, arrears, invoice fields...) overflows top and bottom of the viewport and is unreachable — Esc is the only way out.

**Fix:** give it the same idiom the detail dialog already uses (line 506):
```
max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto overflow-x-hidden
```
Also apply the same constraint to the three other unconstrained `DialogContent`s in this file (~lines 1657, 1735, 1786 — adjustment / advance / repair dialogs) so none can trap the user the same way. To keep the Save/Cancel buttons reachable while scrolling, make the edit dialog's `DialogFooter` sticky: `sticky bottom-0 -mx-6 -mb-6 mt-2 border-t bg-background px-6 py-3`.

## 2. Detail dialog rows nearly slide off the right edge

**Root cause:** `RecentDebtTransactions` rows (line ~1402) put date+description, status, amount, and **three icon buttons** (Delete, Correct, Reverse ≈ 120px of fixed-width buttons) in one `flex` row. On a ~360px phone the fixed-width items crowd the row and the trailing buttons sit at/past the clipped edge (the dialog has `overflow-x-hidden`, so they look cut off).

**Fix:** restructure each row into two lines:
- line 1: date · description (truncating) + amount (right, `tabular-nums`)
- line 2: status text left, the three icon buttons right-aligned with `justify-end`

Same info, nothing clips, no horizontal scroll. The detail dialog's own `overflow-x-hidden` stays as a safety net.

## Verification
- Existing vitest suite still passes (no logic touched).
- Visual check in preview is blocked (no injectable session — `LOVABLE_BROWSER_AUTH_STATUS=no_supabase`), so I'll flag this for your eyeball: open a debt → scroll the Edit dialog to Save; check a debt with linked transactions shows Delete/Correct/Reverse fully on-screen.

## Docs
- Append a bullet to `docs/SESSION.md`. UI-only fix: `DECISIONS.md`/`SCHEMA.md` untouched.
