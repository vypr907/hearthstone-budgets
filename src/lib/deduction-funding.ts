import {
  supabase,
  type Bill,
  type Debt,
  type IncomeSourceDeduction,
  type Transaction,
} from "./supabase";
import { deriveCycleInfo } from "./ledger-state";
import { applyClearedPayment, billCycleDue, debtCycleDue, toPayable } from "./payments";
import { priorCyclesArrears } from "./arrears";

/**
 * ADR-068 (extends ADR-055): a deduction that lands in a real account can also
 * settle the bill/debt it funds. When a paycheck is marked received we look at
 * every bill/debt whose `funding_deduction_id` points at a deduction that has a
 * destination account, and settle that payable's CURRENT cycle only.
 *
 * The deduction is authoritative: if the posted deduction amount doesn't match
 * what the cycle says is due, the cycle is still marked paid and the difference
 * is recorded in `deduction_payment_events` for review. If someone already
 * cleared the cycle by hand, nothing is touched — we only log the no-op.
 */

export type PostedDeduction = {
  deduction: IncomeSourceDeduction;
  /** Amount actually posted for this deduction on this pay event. */
  amount: number;
  /** The deposit transaction written for this deduction (ADR-055). */
  transactionId: string | null;
};

type EventRow = {
  household_id: string;
  bill_id: string | null;
  debt_id: string | null;
  deduction_id: string;
  event_type: "mismatch" | "already_paid_noop";
  expected_amount: number | null;
  actual_amount: number | null;
  note: string | null;
};

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

export async function applyDeductionFundedPayments(args: {
  householdId: string;
  posted: PostedDeduction[];
  /** Groups the payment with the paycheck's other ledger rows. */
  splitGroupId: string;
}): Promise<{ paid: number; events: number }> {
  const funded = args.posted.filter(
    (p) => !!p.deduction.destination_account_id && p.amount > 0,
  );
  if (funded.length === 0) return { paid: 0, events: 0 };

  const deductionIds = funded.map((p) => p.deduction.id);

  const [{ data: billRows, error: billError }, { data: debtRows, error: debtError }] =
    await Promise.all([
      supabase
        .from("bills")
        .select("*")
        .eq("household_id", args.householdId)
        .in("funding_deduction_id", deductionIds),
      supabase
        .from("debts")
        .select("*")
        .eq("household_id", args.householdId)
        .in("funding_deduction_id", deductionIds),
    ]);
  if (billError) throw billError;
  if (debtError) throw debtError;

  const bills = (billRows ?? []) as Bill[];
  const debts = (debtRows ?? []) as Debt[];
  if (bills.length === 0 && debts.length === 0) return { paid: 0, events: 0 };

  // Cycle derivation reads the ledger — load it once (ADR-036).
  const { data: txRows, error: txError } = await supabase
    .from("transactions")
    .select("*")
    .eq("household_id", args.householdId);
  if (txError) throw txError;
  const transactions = (txRows ?? []) as Transaction[];

  const today = todayISO();
  const events: EventRow[] = [];
  let paid = 0;

  for (const p of funded) {
    const targets: Array<{ kind: "bill" | "debt"; row: Bill | Debt }> = [
      ...bills
        .filter((b) => b.funding_deduction_id === p.deduction.id)
        .map((row) => ({ kind: "bill" as const, row })),
      ...debts
        .filter((d) => d.funding_deduction_id === p.deduction.id)
        .map((row) => ({ kind: "debt" as const, row })),
    ];

    for (const t of targets) {
      const payable = toPayable(t.kind, t.row);
      const info = deriveCycleInfo(payable, transactions, today);
      const due =
        t.kind === "bill" ? billCycleDue(t.row as Bill) : debtCycleDue(t.row as Debt);

      if (info.state === "cleared") {
        events.push({
          household_id: args.householdId,
          bill_id: t.kind === "bill" ? t.row.id : null,
          debt_id: t.kind === "debt" ? t.row.id : null,
          deduction_id: p.deduction.id,
          event_type: "already_paid_noop",
          expected_amount: due,
          actual_amount: p.amount,
          note: `Cycle already cleared when "${p.deduction.name}" posted — no change made.`,
        });
        continue;
      }

      // ADR-037: the payable is written first; a 0-row update throws before any
      // ledger row gets linked to it.
      await applyClearedPayment(payable, p.amount, priorCyclesArrears(payable, today));
      paid += 1;

      if (p.transactionId) {
        const { error: linkError } = await supabase
          .from("transactions")
          .update({
            [t.kind === "bill" ? "linked_bill_id" : "linked_debt_id"]: t.row.id,
            split_group_id: args.splitGroupId,
          })
          .eq("id", p.transactionId);
        if (linkError) throw linkError;
      }

      if (Math.abs(due - p.amount) > 0.005) {
        events.push({
          household_id: args.householdId,
          bill_id: t.kind === "bill" ? t.row.id : null,
          debt_id: t.kind === "debt" ? t.row.id : null,
          deduction_id: p.deduction.id,
          event_type: "mismatch",
          expected_amount: due,
          actual_amount: p.amount,
          note: `"${p.deduction.name}" posted ${p.amount.toFixed(2)} against a cycle due of ${due.toFixed(2)}.`,
        });
      }
    }
  }

  if (events.length > 0) {
    const { error } = await supabase.from("deduction_payment_events").insert(events);
    if (error) throw error;
  }

  return { paid, events: events.length };
}
