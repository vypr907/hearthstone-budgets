import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type Bill, type Debt, type Transaction } from "./supabase";
import { advanceDate, reverseDate } from "./format";
import { useAuth } from "./auth-context";

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

export type PayableKind = "bill" | "debt";

export type Payable = {
  kind: PayableKind;
  id: string;
  name: string;
  amount: number;
  category_id: string | null;
  institution_id: string | null;
  bill?: Bill;
  debt?: Debt;
};

export function toPayable(kind: PayableKind, item: Bill | Debt): Payable {
  if (kind === "bill") {
    const b = item as Bill;
    return {
      kind: "bill",
      id: b.id,
      name: b.name,
      amount: Number(b.amount || 0),
      category_id: b.category_id,
      institution_id: b.institution_id,
      bill: b,
    };
  }
  const d = item as Debt;
  return {
    kind: "debt",
    id: d.id,
    name: d.name,
    amount: Number(d.minimum_payment || 0),
    category_id: d.category_id,
    institution_id: d.institution_id,
    debt: d,
  };
}

const linkColumn = (kind: PayableKind) =>
  kind === "bill" ? "linked_bill_id" : "linked_debt_id";
/**
 * Payment mutations need a resolved account: transactions.account_id is NOT NULL.
 * `amount` is the amount being paid right now (ADR-035: every submit/clear can be
 * a partial payment). `cycleAmount` sets what's owed for the whole cycle and is
 * only prompted for variable-amount bills.
 */
export type PayInput = {
  payable: Payable;
  accountId: string;
  amount?: number;
  cycleAmount?: number;
};

const table = (kind: PayableKind) => (kind === "bill" ? "bills" : "debts");

/** Amount owed for the bill's current cycle: the per-cycle override, else the standing amount. */
export function billCycleDue(bill: Bill) {
  const cycle = bill.cycle_amount_due;
  return cycle != null ? Number(cycle) : Number(bill.amount || 0);
}

/** Still owed for the current cycle after partial payments (0 when settled). */
export function billRemainingOwed(bill: Bill) {
  const paid = Number(bill.cycle_paid_to_date ?? 0);
  return Math.max(0, billCycleDue(bill) - paid);
}

/** ADR-035: debts track cycles like bills — the cycle target is the minimum payment. */
export function debtCycleDue(debt: Debt) {
  return Number(debt.minimum_payment || 0);
}

/** Still owed toward this debt's current cycle minimum (0 when settled). */
export function debtRemainingOwed(debt: Debt) {
  const paid = Number(debt.cycle_paid_to_date ?? 0);
  return Math.max(0, debtCycleDue(debt) - paid);
}

/** Remaining owed this cycle for either kind of payable. */
export function payableRemainingOwed(p: Payable) {
  if (p.kind === "bill") return p.bill ? billRemainingOwed(p.bill) : p.amount;
  return p.debt ? debtRemainingOwed(p.debt) : p.amount;
}

/**
 * Apply a cleared payment of `clearedAmount` to the bill/debt row: credit the
 * cycle, and only resolve the cycle (advance the due date, reset the counters)
 * once the cycle target is met. Shared by the Submit/Clear flow and by manual
 * transactions linked to a bill/debt (ADR-035).
 */
export async function applyClearedPayment(p: Payable, clearedAmount: number) {
  if (p.kind === "debt") {
    const debt = p.debt!;
    const remaining = Number(debt.remaining_balance ?? 0);
    const nextBalance = Math.max(0, remaining - clearedAmount);
    const target = debtCycleDue(debt);
    const paid = Number(debt.cycle_paid_to_date ?? 0) + clearedAmount;
    const cycle = (debt.billing_cycle ?? "monthly").toLowerCase();

    const update: Record<string, unknown> = { remaining_balance: nextBalance };
    if (nextBalance === 0 && !debt.date_paid_off) update.date_paid_off = todayISO();

    if (target > 0 && paid + 0.005 < target) {
      // Shortfall: stay pending in the same cycle so a follow-up can be submitted.
      update.payment_status = "pending";
      update.cycle_paid_to_date = paid;
      const { error } = await supabase.from("debts").update(update).eq("id", p.id);
      if (error) throw error;
      return { remaining_owed: target - paid };
    }

    // Cycle satisfied: reset counters, and roll non-monthly debts forward.
    update.cycle_paid_to_date = 0;
    let nextDue: string | null = null;
    if (cycle !== "monthly") {
      nextDue = advanceDate(debt.next_due_date ?? todayISO(), debt.billing_cycle);
      update.next_due_date = nextDue;
      update.payment_status = "unpaid";
    } else {
      // Monthly debts have no next_due_date to roll; keep the cleared marker.
      update.payment_status = "cleared";
    }
    const { error } = await supabase.from("debts").update(update).eq("id", p.id);
    if (error) throw error;
    return { next_due_date: nextDue };
  }

  const bill = p.bill!;
  const dueThisCycle = billCycleDue(bill);
  const paid = Number(bill.cycle_paid_to_date ?? 0) + clearedAmount;

  if (paid + 0.005 < dueThisCycle) {
    const { error } = await supabase
      .from("bills")
      .update({
        payment_status: "pending",
        cycle_paid_to_date: paid,
        cycle_amount_due: dueThisCycle,
      })
      .eq("id", bill.id);
    if (error) throw error;
    return { remaining_owed: dueThisCycle - paid };
  }

  const base = bill.next_due_date ?? todayISO();
  const nextDue = advanceDate(base, bill.billing_cycle);
  const { error } = await supabase
    .from("bills")
    .update({
      payment_status: "unpaid",
      next_due_date: nextDue,
      cycle_paid_to_date: 0,
      cycle_amount_due: null,
    })
    .eq("id", bill.id);
  if (error) throw error;
  return { next_due_date: nextDue };
}



async function findLinkedTransaction(p: Payable, status?: string) {
  let q = supabase
    .from("transactions")
    .select("*")
    .eq(linkColumn(p.kind), p.id)
    .order("transaction_date", { ascending: false })
    .limit(1);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? [])[0] as Transaction | undefined) ?? null;
}

function useAfterPayment() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: ["debts"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };
}

/**
 * ADR-035: a cycle's target amount is fixed the first time a payment is made in
 * it. Variable bills use the prompted `cycleAmount`; fixed bills use bills.amount
 * with no prompt. Returns the payable with the stored value applied.
 */
async function ensureCycleAmount(p: Payable, cycleAmount?: number): Promise<Payable> {
  if (p.kind !== "bill" || !p.bill) return p;
  if (p.bill.cycle_amount_due != null) return p;
  const value = p.bill.is_variable_amount
    ? Math.abs(Number(cycleAmount ?? p.bill.amount ?? p.amount) || 0)
    : Number(p.bill.amount || 0);
  const { error } = await supabase
    .from("bills")
    .update({ cycle_amount_due: value })
    .eq("id", p.id);
  if (error) throw error;
  return { ...p, bill: { ...p.bill, cycle_amount_due: value } };
}

/**
 * Mark submitted: create a pending ledger transaction for the amount being paid
 * now (which may be a partial payment) and set payment_status to 'pending'.
 * Submitting again while already pending adds another partial payment.
 */
export function useMarkSubmitted() {
  const { householdId } = useAuth();
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({ payable, accountId, amount, cycleAmount }: PayInput) => {
      const p = await ensureCycleAmount(payable, cycleAmount);
      const amt = Math.abs(Number(amount ?? payableRemainingOwed(p) ?? p.amount) || 0);
      const { error } = await supabase.from("transactions").insert({
        household_id: householdId,
        account_id: accountId,
        category_id: p.category_id,
        amount: -amt,
        status: "pending",
        description: `${p.kind === "bill" ? "Bill" : "Debt"} payment · ${p.name}`,
        transaction_date: todayISO(),
        [linkColumn(p.kind)]: p.id,
      });
      if (error) throw error;
      const { error: e2 } = await supabase
        .from(table(p.kind))
        .update({ payment_status: "pending" })
        .eq("id", p.id);
      if (e2) throw e2;
      const owed = payableRemainingOwed(p) - amt;
      return owed > 0.005 ? { remaining_owed: owed } : {};
    },
    onSuccess: done,
  });
}


/**
 * Mark cleared: clear the linked pending transaction (creating one if the
 * payment was never submitted), then credit the cycle through
 * `applyClearedPayment` — resolving the cycle only once it is fully covered.
 */
export function useMarkCleared() {
  const { householdId } = useAuth();
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({ payable, accountId, amount, cycleAmount }: PayInput) => {
      const p = await ensureCycleAmount(payable, cycleAmount);
      const requested = Math.abs(Number(amount ?? payableRemainingOwed(p) ?? p.amount) || 0);
      const existing = await findLinkedTransaction(p, "pending");
      let clearedAmount = requested;
      if (existing) {
        clearedAmount = Math.abs(Number(existing.amount ?? requested));
        const { error } = await supabase
          .from("transactions")
          .update({ status: "cleared" })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transactions").insert({
          household_id: householdId,
          account_id: accountId,
          category_id: p.category_id,
          amount: -requested,
          status: "cleared",
          description: `${p.kind === "bill" ? "Bill" : "Debt"} payment · ${p.name}`,
          transaction_date: todayISO(),
          [linkColumn(p.kind)]: p.id,
        });
        if (error) throw error;
      }

      return applyClearedPayment(p, clearedAmount);
    },
    onSuccess: done,
  });
}



/**
 * Undo = full reversal: delete the linked ledger transaction, revert a bill's
 * next_due_date by the same billing-cycle interval that clearing added, add a
 * debt's payment back onto remaining_balance, and reset payment_status.
 */
export function useMarkUnpaid() {
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async (p: Payable) => {
      const tx = await findLinkedTransaction(p);
      const wasCleared = tx?.status === "cleared";

      if (tx) {
        const { error } = await supabase.from("transactions").delete().eq("id", tx.id);
        if (error) throw error;
      }

      if (p.kind === "debt") {
        const update: Record<string, unknown> = { payment_status: "unpaid" };
        if (wasCleared) {
          const amount = Math.abs(Number(tx?.amount ?? p.amount));
          update.remaining_balance = Number(p.debt?.remaining_balance ?? 0) + amount;
          const paid = Number(p.debt?.cycle_paid_to_date ?? 0);
          if (paid > 0) {
            // Reversing a partial payment: stay in the same cycle, take it back off.
            update.cycle_paid_to_date = Math.max(0, paid - amount);
          } else {
            // The clear resolved the cycle — undo that roll-forward.
            const cycle = (p.debt?.billing_cycle ?? "monthly").toLowerCase();
            if (cycle !== "monthly" && p.debt?.next_due_date) {
              update.next_due_date = reverseDate(p.debt.next_due_date, p.debt.billing_cycle);
            }
            update.cycle_paid_to_date = 0;
          }
        }
        const { error } = await supabase.from("debts").update(update).eq("id", p.id);
        if (error) throw error;
        return;
      }



      const bill = p.bill;
      const update: Record<string, unknown> = { payment_status: "unpaid" };
      if (wasCleared) {
        const amount = Math.abs(Number(tx?.amount ?? p.amount));
        const paid = Number(bill?.cycle_paid_to_date ?? 0);
        if (paid > 0) {
          // Reversing a partial payment: stay in the same cycle, just take it back off.
          const next = Math.max(0, paid - amount);
          update.cycle_paid_to_date = next;
          if (next === 0 && !bill?.is_variable_amount) update.cycle_amount_due = null;
        } else if (bill?.next_due_date) {
          // The clear rolled the bill into its next cycle — undo that roll-forward.
          update.next_due_date = reverseDate(bill.next_due_date, bill.billing_cycle);
          update.cycle_paid_to_date = 0;
          update.cycle_amount_due = null;
        }
      }
      const { error } = await supabase.from("bills").update(update).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}


/**
 * ADR-036 full reset: undo an entire cycle, not just its latest transaction.
 * Deletes every transaction tied to the cycle, zeroes cycle_paid_to_date and
 * reverts payment_status / next_due_date to their pre-clear values (extends
 * ADR-008 to multi-transaction cycles).
 */
export type ResetCycleInput = {
  payable: Payable;
  transactionIds: string[];
  /** Total cleared in the cycle — added back to a debt's remaining balance. */
  clearedTotal: number;
  /** True when clearing had already advanced the due date. */
  resolved: boolean;
};

export function useResetCycle() {
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({ payable, transactionIds, clearedTotal, resolved }: ResetCycleInput) => {
      if (transactionIds.length > 0) {
        const { error } = await supabase
          .from("transactions")
          .delete()
          .in("id", transactionIds);
        if (error) throw error;
      }

      if (payable.kind === "debt") {
        const debt = payable.debt!;
        const update: Record<string, unknown> = {
          payment_status: "unpaid",
          cycle_paid_to_date: 0,
          remaining_balance: Number(debt.remaining_balance ?? 0) + clearedTotal,
          date_paid_off: null,
        };
        const cycle = (debt.billing_cycle ?? "monthly").toLowerCase();
        if (resolved && cycle !== "monthly" && debt.next_due_date) {
          update.next_due_date = reverseDate(debt.next_due_date, debt.billing_cycle);
        }
        const { error } = await supabase.from("debts").update(update).eq("id", payable.id);
        if (error) throw error;
        return;
      }

      const bill = payable.bill!;
      const update: Record<string, unknown> = {
        payment_status: "unpaid",
        cycle_paid_to_date: 0,
        cycle_amount_due: null,
      };
      if (resolved && bill.next_due_date) {
        update.next_due_date = reverseDate(bill.next_due_date, bill.billing_cycle);
      }
      const { error } = await supabase.from("bills").update(update).eq("id", payable.id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}
