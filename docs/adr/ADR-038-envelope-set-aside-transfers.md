## ADR-038: Envelope Set Aside Transfers

Decision:
Bills with a linked envelope goal (savings_goals.linked_bill_id, from ADR-033) gain a
"Set Aside" action. Tapping it prompts for a source account (any household account) and
an amount, defaulting to monthlyEquivalent(bill) (ADR-033, computed live — no stored
monthly_amount column). If the envelope's account_id is unset, the user is first prompted
to choose/assign a destination account, which is saved back to savings_goals.account_id.

Confirming creates two cleared transactions in one action (a true transfer, not a single
tagged entry):
1. Debit: -amount on the chosen source account, no linked_goal_id, description
   "Set aside: <bill name> → <envelope name>".
2. Credit: +amount on the envelope's account_id, linked_goal_id = the envelope's id.

The credit transaction is what drives the envelope's derived current_amount (ADR-027,
unchanged) — the debit transaction only reduces the source account's balance, exactly
like a normal manual outflow. No new "transfer" table or transfer_id is introduced; the
pairing exists only in the UI action, not as a stored relationship.

Reason:
An envelope's saved balance should represent real money that actually left a spendable
account, not just a mental earmark — otherwise the household's total balance would be
double-counted (spendable + envelope, for money that was never actually moved). A true
two-sided transfer keeps every account's balance accurate to the real bank picture.

Open item: no guard against setting aside more than once in the same month — left manual/
unrestricted for now; revisit if double set-asides become a real problem in practice.

Status: Decided 2026-08-05. Implemented 2026-08-05 (`src/components/SetAsideAction.tsx`,
rendered on the bill detail view when a linked envelope goal exists).

2026-08-26 addendum — warn on a repeat same-month Set Aside:
The "no guard" open item above is resolved as warn-and-allow, not a hard block.
Before writing the transfer pair, `SetAsideAction` checks for an existing cleared
credit transaction with `linked_goal_id` = this envelope whose description begins
"Set aside: <bill name>" dated in the current calendar month. If one exists, a
confirm() warns ("You already set aside $X for <bill> this month on <date> — set
aside again anyway?") and proceeds only on OK. A top-up or correction is legitimate,
so the action is never prevented — just made deliberate. No schema change.
Implemented 2026-08-26.

