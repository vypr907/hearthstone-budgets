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

const linkColumn = (kind: PayableKind) => (kind === "bill" ? "linked_bill_id" : "linked_debt_id");
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
  /** ADR-046: optional processing/convenience fee charged with the payment. */
  fee?: number;
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
 * Update a bill/debt row and verify it actually changed. A silent 0-row update
 * (RLS, stale schema cache) previously left the ledger written but the payable
 * untouched — the "both transactions cleared but nothing updated" bug.
 */
async function updateRow(
  tableName: "bills" | "debts",
  id: string,
  update: Record<string, unknown>,
) {
  const { data, error } = await supabase.from(tableName).update(update).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      `Could not update this ${tableName === "bills" ? "bill" : "debt"} — no row was changed.`,
    );
  }
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
      await updateRow("debts", p.id, update);
      return { remaining_owed: target - paid };
    }

    // Cycle satisfied: reset counters, and roll non-monthly debts forward.
    update.cycle_paid_to_date = 0;
    let nextDue: string | null = null;
    if (cycle === "one_time") {
      // ADR-048: a one-time charge never rolls — it closes out when it hits zero.
      update.payment_status = nextBalance === 0 ? "cleared" : "unpaid";
    } else if (cycle !== "monthly") {
      nextDue = advanceDate(
        debt.next_due_date ?? todayISO(),
        debt.billing_cycle,
        debt.cycle_interval_days,
      );
      update.next_due_date = nextDue;
      update.payment_status = "unpaid";
    } else {
      // Monthly debts have no next_due_date to roll; keep the cleared marker.
      update.payment_status = "cleared";
    }

    await updateRow("debts", p.id, update);
    return { next_due_date: nextDue };
  }

  const bill = p.bill!;
  const dueThisCycle = billCycleDue(bill);
  const paid = Number(bill.cycle_paid_to_date ?? 0) + clearedAmount;

  if (paid + 0.005 < dueThisCycle) {
    await updateRow("bills", bill.id, {
      payment_status: "pending",
      cycle_paid_to_date: paid,
      cycle_amount_due: dueThisCycle,
    });
    return { remaining_owed: dueThisCycle - paid };
  }

  const base = bill.next_due_date ?? todayISO();
  const nextDue = advanceDate(base, bill.billing_cycle, bill.cycle_interval_days);
  await updateRow("bills", bill.id, {
    payment_status: "unpaid",
    next_due_date: nextDue,
    cycle_paid_to_date: 0,
    cycle_amount_due: null,
  });
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

/**
 * ADR-046: fees ride alongside a payment as their own ledger row so they hit the
 * account balance without ever counting toward the bill/debt cycle.
 *
 * ADR-046 fix: the fee is PAIRED to its payment via `split_group_id` (never via
 * linked_bill_id/linked_debt_id) so cycle math — clearedSum, state derivation,
 * debt balance reversal — never sees it. That keeps clearing, reversing and
 * deleting atomic: any operation on the payment propagates to its fee.
 */
async function insertFeeTransaction(
  householdId: string | null | undefined,
  p: Payable,
  accountId: string,
  fee: number | undefined,
  status: "pending" | "cleared",
  /** Shared with the payment row so the pair stays atomic (ADR-046). */
  splitGroupId?: string | null,
) {
  const amt = Math.abs(Number(fee) || 0);
  if (amt < 0.005) return;
  // ADR-046: fees land in the household's "Fees" category. Auto-create it if it
  // doesn't exist so fee rows are always categorised.
  let feeCatId = (await supabase
    .from("categories")
    .select("id")
    .eq("household_id", householdId!)
    .ilike("name", "fees")
    .limit(1)).data?.[0]?.id;
  if (!feeCatId && householdId) {
    const { data: created, error: catErr } = await supabase
      .from("categories")
      .insert({ household_id: householdId, name: "Fees" })
      .select("id")
      .single();
    if (catErr) throw catErr;
    feeCatId = created?.id ?? null;
  }
  const { error } = await supabase.from("transactions").insert({
    household_id: householdId,
    account_id: accountId,
    category_id: feeCatId ?? null,
    amount: -amt,
    status,
    description: `Fee: ${p.name}`,
    transaction_date: todayISO(),
    // Paired to the payment, NOT linked to the payable — see ADR-046 note above.
    split_group_id: splitGroupId ?? null,
  });
  if (error) throw error;
}

/**
 * Clear every pending fee row paired with a payment (same split_group_id).
 * Called when a submitted payment is marked cleared so the fee clears too.
 */
async function clearPairedFees(splitGroupId: string | null | undefined) {
  if (!splitGroupId) return;
  const { error } = await supabase
    .from("transactions")
    .update({ status: "cleared" })
    .eq("status", "pending")
    .eq("split_group_id", splitGroupId)
    .ilike("description", "Fee:%");
  if (error) throw error;
}

/**
 * Delete every fee row paired with a payment (same split_group_id). Called on
 * undo/reset so a reversed payment takes its fee with it.
 */
async function deletePairedFees(splitGroupId: string | null | undefined) {
  if (!splitGroupId) return;
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("split_group_id", splitGroupId)
    .ilike("description", "Fee:%");
  if (error) throw error;
}

/**
 * Resolve the split_group_id values for a set of transaction ids, so a cycle
 * reset can delete the fee rows paired with each payment it removes.
 */
async function groupIdsFor(transactionIds: string[]): Promise<string[]> {
  if (transactionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("transactions")
    .select("split_group_id")
    .in("id", transactionIds);
  if (error) throw error;
  return (data as { split_group_id: string | null }[] | null ?? [])
    .map((r) => r.split_group_id)
    .filter((g): g is string => !!g);
}

function useAfterPayment() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: ["debts"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
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
  const { error } = await supabase.from("bills").update({ cycle_amount_due: value }).eq("id", p.id);
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
    mutationFn: async ({ payable, accountId, amount, cycleAmount, fee }: PayInput) => {
      const p = await ensureCycleAmount(payable, cycleAmount);
      const amt = Math.abs(Number(amount ?? payableRemainingOwed(p) ?? p.amount) || 0);
      // Mark the payable pending first so a failed status write never leaves an
      // orphan ledger row behind.
      await updateRow(table(p.kind), p.id, { payment_status: "pending" });
      // ADR-046: pair the payment with its fee via a shared split_group_id so a
      // later clear/undo/reset touches both atomically.
      const groupId = crypto.randomUUID();
      const { error } = await supabase.from("transactions").insert({
        household_id: householdId,
        account_id: accountId,
        category_id: p.category_id,
        amount: -amt,
        status: "pending",
        description: `${p.kind === "bill" ? "Bill" : "Debt"} payment · ${p.name}`,
        transaction_date: todayISO(),
        [linkColumn(p.kind)]: p.id,
        split_group_id: groupId,
      });
      if (error) throw error;

      await insertFeeTransaction(householdId, p, accountId, fee, "pending", groupId);

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
    mutationFn: async ({ payable, accountId, amount, cycleAmount, fee }: PayInput) => {
      const p = await ensureCycleAmount(payable, cycleAmount);
      const requested = Math.abs(Number(amount ?? payableRemainingOwed(p) ?? p.amount) || 0);
      const existing = await findLinkedTransaction(p, "pending");
      const clearedAmount = existing ? Math.abs(Number(existing.amount ?? requested)) : requested;

      // Update the bill/debt FIRST: if that fails we bail out before touching the
      // ledger, instead of stranding a cleared transaction with no effect.
      const result = await applyClearedPayment(p, clearedAmount);

      if (existing) {
        const { error } = await supabase
          .from("transactions")
          .update({ status: "cleared" })
          .eq("id", existing.id);
        if (error) throw error;
        // ADR-046: a fee submitted alongside this payment is still pending —
        // clear it too so it doesn't strand when the payment clears.
        await clearPairedFees(existing.split_group_id);
      } else {
        // Direct clear (no prior submit): insert a cleared payment, paired with
        // any fee entered on this clear via split_group_id.
        const groupId = crypto.randomUUID();
        const { error } = await supabase.from("transactions").insert({
          household_id: householdId,
          account_id: accountId,
          category_id: p.category_id,
          amount: -requested,
          status: "cleared",
          description: `${p.kind === "bill" ? "Bill" : "Debt"} payment · ${p.name}`,
          transaction_date: todayISO(),
          [linkColumn(p.kind)]: p.id,
          split_group_id: groupId,
        });
        if (error) throw error;
        await insertFeeTransaction(householdId, p, accountId, fee, "cleared", groupId);
      }

      return result;
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
        // ADR-046: take the paired fee with the reversed payment.
        await deletePairedFees(tx.split_group_id);
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
              update.next_due_date = reverseDate(
                p.debt.next_due_date,
                p.debt.billing_cycle,
                p.debt.cycle_interval_days,
              );
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
          update.next_due_date = reverseDate(
            bill.next_due_date,
            bill.billing_cycle,
            bill.cycle_interval_days,
          );
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
        const { error } = await supabase.from("transactions").delete().in("id", transactionIds);
        if (error) throw error;
        // ADR-046: remove the fee rows paired with each cleared payment. Fees
        // were never linked to the payable, so they aren't in transactionIds.
        for (const g of await groupIdsFor(transactionIds)) await deletePairedFees(g);
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
          update.next_due_date = reverseDate(
            debt.next_due_date,
            debt.billing_cycle,
            debt.cycle_interval_days,
          );
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
        update.next_due_date = reverseDate(
          bill.next_due_date,
          bill.billing_cycle,
          bill.cycle_interval_days,
        );
      }
      const { error } = await supabase.from("bills").update(update).eq("id", payable.id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}
