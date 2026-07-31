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
/** Payment mutations need a resolved account: transactions.account_id is NOT NULL. */
export type PayInput = { payable: Payable; accountId: string };

const table = (kind: PayableKind) => (kind === "bill" ? "bills" : "debts");

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
 * Mark submitted: create a pending ledger transaction and set the
 * bill/debt payment_status to 'pending'.
 */
export function useMarkSubmitted() {
  const { householdId } = useAuth();
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({ payable: p, accountId }: PayInput) => {
      const existing = await findLinkedTransaction(p, "pending");
      if (!existing) {
        const { error } = await supabase.from("transactions").insert({
          household_id: householdId,
          account_id: accountId,
          category_id: p.category_id,
          amount: -Math.abs(p.amount),
          status: "pending",
          description: `${p.kind === "bill" ? "Bill" : "Debt"} payment · ${p.name}`,
          transaction_date: todayISO(),
          [linkColumn(p.kind)]: p.id,
        });
        if (error) throw error;
      }
      const { error: e2 } = await supabase
        .from(table(p.kind))
        .update({ payment_status: "pending" })
        .eq("id", p.id);
      if (e2) throw e2;
    },
    onSuccess: done,
  });
}

/**
 * Mark cleared: clear the linked pending transaction (creating one if the
 * payment was never submitted), set payment_status, reduce debt balances,
 * and roll bills forward to their next cycle.
 */
export function useMarkCleared() {
  const { householdId } = useAuth();
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({ payable: p, accountId }: PayInput) => {
      const existing = await findLinkedTransaction(p, "pending");
      if (existing) {
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
          amount: -Math.abs(p.amount),
          status: "cleared",
          description: `${p.kind === "bill" ? "Bill" : "Debt"} payment · ${p.name}`,
          transaction_date: todayISO(),
          [linkColumn(p.kind)]: p.id,
        });
        if (error) throw error;
      }

      if (p.kind === "debt") {
        const remaining = Number(p.debt?.remaining_balance ?? 0);
        const next = Math.max(0, remaining - Math.abs(p.amount));
        const cycle = (p.debt?.billing_cycle ?? "monthly").toLowerCase();
        const update: Record<string, unknown> = {
          payment_status: "cleared",
          remaining_balance: next,
        };
        // Non-monthly debts roll forward on their own cycle, like bills.
        let nextDue: string | null = null;
        if (cycle !== "monthly") {
          nextDue = advanceDate(p.debt?.next_due_date ?? todayISO(), p.debt?.billing_cycle);
          update.next_due_date = nextDue;
        }
        const { error } = await supabase.from("debts").update(update).eq("id", p.id);
        if (error) throw error;
        return { next_due_date: nextDue };
      }


      // Bills: mark cleared, then roll forward into the next cycle.
      const bill = p.bill!;
      const { error: e1 } = await supabase
        .from("bills")
        .update({ payment_status: "cleared" })
        .eq("id", bill.id);
      if (e1) throw e1;
      const base = bill.next_due_date ?? todayISO();
      const nextDue = advanceDate(base, bill.billing_cycle);
      const { error: e2 } = await supabase
        .from("bills")
        .update({ payment_status: "unpaid", next_due_date: nextDue })
        .eq("id", bill.id);
      if (e2) throw e2;
      return { next_due_date: nextDue };
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
          const cycle = (p.debt?.billing_cycle ?? "monthly").toLowerCase();
          if (cycle !== "monthly" && p.debt?.next_due_date) {
            update.next_due_date = reverseDate(p.debt.next_due_date, p.debt.billing_cycle);
          }
        }
        const { error } = await supabase.from("debts").update(update).eq("id", p.id);
        if (error) throw error;
        return;
      }


      const bill = p.bill;
      const update: Record<string, unknown> = { payment_status: "unpaid" };
      if (wasCleared && bill?.next_due_date) {
        update.next_due_date = reverseDate(bill.next_due_date, bill.billing_cycle);
      }
      const { error } = await supabase.from("bills").update(update).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}

