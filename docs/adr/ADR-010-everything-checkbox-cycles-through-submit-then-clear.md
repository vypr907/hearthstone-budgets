## ADR-010: Everything Checkbox Cycles Through Submit-Then-Clear

Decision:
On the Everything screen, tapping a bill/debt's checkbox cycles it through the same states
as Bills/Debts: unpaid → pending → cleared. It does not jump straight to 'cleared' in one tap.

Reason:
Consistency with Bills/Debts' submit-then-clear semantics (Phase 3.5) outweighs the extra
tap. A one-tap "cleared" shortcut risks the same mismatch that caused earlier bugs in this
area — Everything having its own shortcut logic instead of sharing one real flow.

Status: Implemented 2026-07-28.

