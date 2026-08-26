import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type AutoTransfer, type Transaction } from "./supabase";
import { advanceDate, reverseDate, shiftDateSafe } from "./format";
import { useAuth } from "./auth-context";
import { useTransactions } from "./data-hooks";
import type { CycleInfo, LedgerState } from "./ledger-state";

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

const day = (d: string | null | undefined) => (d ? d.slice(0, 10) : "");

/**
 * ADR-081: a stripped-down version of ledger-state.ts's `deriveCycleInfo` for
 * auto-transfers. An auto-transfer has no partial/pending concept — it either
 * processed this cycle (a cleared transaction tagged `linked_auto_transfer_id`
 * exists in the window) or it didn't — so this only ever produces "unpaid" or
 * "cleared", reusing the same due-date window / already-resolved lookback
 * logic so a just-processed transfer doesn't misread as still due.
 */
export function deriveAutoTransferState(
  at: AutoTransfer,
  transactions: Transaction[],
  today: string,
): CycleInfo {
  const due = Number(at.amount || 0);
  const dueDate = day(at.next_due_date);
  const cycleName = at.billing_cycle;
  const cycleDays = at.cycle_interval_days;
  const openStart = dueDate ? shiftDateSafe(dueDate, cycleName, -1, cycleDays) : today;

  const linked = transactions.filter(
    (t) => t.linked_auto_transfer_id === at.id && t.status === "cleared",
  );
  // ADR-075-style tagging: exclude a transaction already attributed to an
  // earlier, now-closed cycle.
  const eligible = dueDate
    ? linked.filter((t) => {
        const tagged = day(t.resolved_cycle_due_date);
        return !tagged || tagged >= dueDate;
      })
    : linked;

  const between = (t: Transaction, start: string, end: string) => {
    const d = day(t.transaction_date);
    return !!d && d > start && d <= end;
  };

  const pastDue = !!dueDate && today > dueDate;
  let cycleTx = pastDue
    ? eligible.filter((t) => {
        const d = day(t.transaction_date);
        return !!d && d >= dueDate && d <= today;
      })
    : eligible.filter((t) => between(t, openStart, today));
  let resolved = false;

  if (cycleTx.length === 0 && dueDate && today <= openStart) {
    // Processing immediately rolls next_due_date forward, so a transfer that
    // already resolved the cycle covering today sits in the *previous* window.
    const prevStart = shiftDateSafe(openStart, cycleName, -1, cycleDays);
    const prev = eligible.filter((t) => between(t, prevStart, openStart));
    if (prev.length > 0) {
      cycleTx = prev;
      resolved = true;
    }
  }

  const clearedSum = cycleTx.reduce((s, t) => s + Math.abs(Number(t.amount ?? 0)), 0);
  const state: LedgerState = cycleTx.length > 0 ? "cleared" : "unpaid";

  return {
    state,
    due,
    clearedSum,
    remaining: state === "cleared" ? 0 : Math.max(0, due - clearedSum),
    transactions: cycleTx,
    pending: null,
    resolved,
  };
}

/**
 * ADR-081: "Process transfer" — writes a normal ADR-056 transfer pair (two
 * cleared transactions sharing transfer_group_id) and advances the
 * auto-transfer's next_due_date.
 *
 * Write order (2026-08-26): both ledger legs first, the next_due_date advance
 * LAST — the opposite of applyClearedPayment's ADR-037 "payable first" rule,
 * and deliberately so. Here the "payable" write is only a scheduling-date bump,
 * not a balance, so ADR-037's orphan-transaction concern doesn't apply; what
 * matters more is that a failure between the legs and the date advance must not
 * skip the cycle. If the date update fails now, deriveAutoTransferState still
 * reads the (un-advanced) cycle as "cleared" off the credit leg's
 * resolved_cycle_due_date tag, and the user can retry/undo. The credit
 * (destination) leg carries linked_auto_transfer_id so deriveAutoTransferState
 * can find it; the debit leg stays a plain transfer leg like any other.
 */
export function useProcessAutoTransfer() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (at: AutoTransfer) => {
      const resolvedDueDate = at.next_due_date;
      const nextDue = advanceDate(at.next_due_date, at.billing_cycle, at.cycle_interval_days);

      const groupId = crypto.randomUUID();
      const base = {
        household_id: householdId!,
        status: "cleared" as const,
        description: `Auto-transfer · ${at.name}`,
        transaction_date: todayISO(),
        transfer_group_id: groupId,
        category_id: at.category_id ?? null,
      };
      // Debit (from-side) first; if this fails, nothing else is written.
      const { error: e1 } = await supabase.from("transactions").insert({
        ...base,
        account_id: at.from_account_id,
        amount: -Number(at.amount),
      });
      if (e1) throw e1;
      // Credit (to-side); if this fails the debit is orphaned — same accepted
      // risk as useSaveTransfer/useCreateAdvance (no DB transaction available).
      const { error: e2 } = await supabase.from("transactions").insert({
        ...base,
        account_id: at.to_account_id,
        amount: Number(at.amount),
        linked_auto_transfer_id: at.id,
        resolved_cycle_due_date: resolvedDueDate,
      });
      if (e2) throw e2;

      // Date advance LAST: a failure here leaves a complete, correctly-tagged
      // transfer pair and a stale due date — not a silently-skipped cycle.
      const { data, error: updErr } = await supabase
        .from("auto_transfers")
        .update({ next_due_date: nextDue })
        .eq("id", at.id)
        .select("id");
      if (updErr) throw updErr;
      if (!data || data.length === 0) {
        throw new Error("Could not advance this auto-transfer's due date — no row was changed.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auto_transfers"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["latest_balances"] });
    },
  });
}

/**
 * ADR-081: undo a processed cycle — delete the transfer pair (by
 * transfer_group_id, same as useDeleteTransferPair) and reverse
 * next_due_date by the same interval processing advanced it.
 */
export function useUndoAutoTransferProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (at: AutoTransfer) => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("linked_auto_transfer_id", at.id)
        .order("transaction_date", { ascending: false })
        .limit(1);
      if (error) throw error;
      const tx = ((data ?? [])[0] as Transaction | undefined) ?? null;
      if (!tx?.transfer_group_id) {
        throw new Error("No processed transfer found to undo.");
      }
      const { error: delErr } = await supabase
        .from("transactions")
        .delete()
        .eq("transfer_group_id", tx.transfer_group_id);
      if (delErr) throw delErr;

      const reverted = reverseDate(at.next_due_date, at.billing_cycle, at.cycle_interval_days);
      const { error: updErr } = await supabase
        .from("auto_transfers")
        .update({ next_due_date: reverted })
        .eq("id", at.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auto_transfers"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["latest_balances"] });
    },
  });
}

/** Convenience wrapper mirroring ledger-state.ts's useCycleState(). */
export function useAutoTransferCycleState() {
  const { data: transactions = [] } = useTransactions();
  return useMemo(() => {
    const today = todayISO();
    return (at: AutoTransfer) => deriveAutoTransferState(at, transactions, today);
  }, [transactions]);
}

/**
 * True when an auto-transfer's due date has passed with nothing processed —
 * not "overdue" in the bills/debts sense (nothing is owed to a vendor), just
 * a signal the app hasn't been told the bank's automatic transfer happened.
 */
export function isAutoTransferOverdue(at: AutoTransfer, info: CycleInfo, today: string = todayISO()) {
  return info.state === "unpaid" && !!at.next_due_date && day(at.next_due_date) < today;
}
