import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type Bill, type BillAdjustment, type Debt, type Transaction } from "./supabase";
import { advanceDate, reverseDate, shiftDateSafe, formatMoney } from "./format";
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
  /** Payment date; defaults to today when omitted — lets a payment be backdated. */
  date?: string;
  /**
   * ADR-076: the payable's arrears owed strictly from cycles before the
   * current one (`priorCyclesArrears()`, arrears.ts) — only meaningful for
   * useMarkCleared, which threads it into applyClearedPayment's overflow
   * cap/reduction. Omit only when there's no arrears to worry about.
   */
  priorArrears?: number;
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

/**
 * ADR-056 addendum: for debt_type='advance' debts, minimum_payment always
 * mirrors remaining_balance — the whole draw is due next cycle, no manual
 * entry. Merge this into any debts update that also sets remaining_balance.
 */
export function advanceMinimumPaymentPatch(debt: Debt, newRemainingBalance: number) {
  return debt.debt_type === "advance" ? { minimum_payment: newRemainingBalance } : {};
}

/**
 * ADR-066: recording a new advance against a paid-off advance-type debt
 * reactivates it in place. Beyond clearing `date_paid_off`, that also starts a
 * fresh cycle — so the stale `payment_status`/`cycle_paid_to_date` left from the
 * last payoff must be reset too, or the Debts list keeps showing a "cleared"
 * chip on a debt that now owes money until the next status write. Returns an
 * empty patch for any debt that isn't a paid-off advance.
 */
export function advanceReactivationPatch(debt: Debt) {
  const isPaidOffAdvance = debt.debt_type === "advance" && !!debt.date_paid_off;
  return isPaidOffAdvance
    ? { date_paid_off: null, payment_status: "unpaid", cycle_paid_to_date: 0 }
    : {};
}

/** Still owed toward this debt's current cycle minimum (0 when settled). */
export function debtRemainingOwed(debt: Debt) {
  const paid = Number(debt.cycle_paid_to_date ?? 0);
  return Math.max(0, debtCycleDue(debt) - paid);
}

/**
 * ADR-058 addendum: rebuild `cycle_amount_due` for a fixed bill whose cycle is
 * being reset/undone. Nulling it unconditionally silently drops the effect of
 * an active `bill_adjustments` row on what's owed (this is how Beiers got into
 * its "Credit now" bug). This recomputes `bill.amount` plus the sum of
 * `affects_balance` adjustments dated within the (restored) current cycle — a
 * one-interval band around `dueDate`, matching `deriveCycleInfo`'s half-open
 * window (`> start`, `<= end`). Returns `null` when there is no such
 * adjustment, or for a variable bill (whose `cycle_amount_due` is a
 * user-entered figure, not derivable from `amount`) — so those cases reset
 * exactly as they did before.
 */
export function rebuiltCycleAmountDue(
  bill: Pick<
    Bill,
    "id" | "amount" | "billing_cycle" | "cycle_interval_days" | "is_variable_amount"
  >,
  adjustments: Pick<
    BillAdjustment,
    "bill_id" | "amount" | "affects_balance" | "adjustment_date"
  >[],
  dueDate: string | null | undefined,
): number | null {
  const due = dueDate?.slice(0, 10);
  if (!due || bill.is_variable_amount) return null;
  const start = shiftDateSafe(due, bill.billing_cycle, -1, bill.cycle_interval_days);
  const end = shiftDateSafe(due, bill.billing_cycle, 1, bill.cycle_interval_days);
  const active = adjustments.filter((a) => {
    const d = a.adjustment_date?.slice(0, 10);
    return (
      a.bill_id === bill.id &&
      a.affects_balance !== false &&
      !!d &&
      d > start &&
      d <= end
    );
  });
  if (active.length === 0) return null;
  const delta = active.reduce((s, a) => s + Number(a.amount ?? 0), 0);
  return Math.max(0, Math.round((Number(bill.amount ?? 0) + delta) * 100) / 100);
}

/**
 * Read a bill's adjustment rows for a reset recompute. Degrades to `[]` on any
 * read error so a reset never fails outright — the caller then falls back to
 * the old null-ing behavior rather than blocking the undo.
 */
async function fetchBillAdjustments(billId: string): Promise<BillAdjustment[]> {
  try {
    const { data, error } = await supabase
      .from("bill_adjustments")
      .select("*")
      .eq("bill_id", billId);
    if (error) throw error;
    return (data ?? []) as BillAdjustment[];
  } catch (e) {
    console.warn("[rebuiltCycleAmountDue] bill_adjustments read failed, resetting flat", e);
    return [];
  }
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
 * ADR-075: tag every cleared, linked, still-untagged transaction for this payable
 * with the due date a resolve just satisfied. `deriveCycleInfo` uses this to stop
 * misattributing a late payment (dated after the due date it resolved) to the
 * freshly-rolled next cycle's display window.
 */
async function tagResolvedCycle(kind: PayableKind, id: string, oldDueDate: string) {
  const { error } = await supabase
    .from("transactions")
    .update({ resolved_cycle_due_date: oldDueDate })
    .eq(linkColumn(kind), id)
    .eq("status", "cleared")
    .is("resolved_cycle_due_date", null);
  if (error) throw error;
}

/**
 * Apply a cleared payment of `clearedAmount` to the bill/debt row: credit the
 * cycle, and only resolve the cycle (advance the due date, reset the counters)
 * once the cycle target is met. Shared by the Submit/Clear flow and by manual
 * transactions linked to a bill/debt (ADR-035).
 *
 * ADR-057/078: any amount paid beyond the current cycle increments the
 * running `arrears_paid_to_date` counter (never `opening_arrears`/
 * `arrears_as_of` directly — see ADR-078 for why). Bills cap at
 * `cycle_due + priorArrears` — excess is rejected so money isn't silently
 * left unaccounted.
 *
 * `priorArrears` is the payable's arrears owed strictly from cycles BEFORE
 * the current one (`priorCyclesArrears()` in arrears.ts) — computed by the
 * caller, not here, so this module doesn't import arrears.ts (which already
 * imports from this one). Required, not defaulted: every call site must
 * think about it, since passing 0 silently caps/reduces arrears wrong.
 */
export async function applyClearedPayment(
  p: Payable,
  clearedAmount: number,
  priorArrears: number,
  /** The payment's own date — used for date_paid_off, not real "today", so a backdated payment doesn't record today's date as the payoff date. */
  date: string = todayISO(),
): Promise<{ remaining_owed?: number; next_due_date?: string | null; resolved_due_date?: string }> {
  if (p.kind === "debt") {
    const debt = p.debt!;
    const remaining = Number(debt.remaining_balance ?? 0);
    const nextBalance = Math.max(0, remaining - clearedAmount);
    const target = debtCycleDue(debt);
    const previouslyPaid = Number(debt.cycle_paid_to_date ?? 0);
    const paid = previouslyPaid + clearedAmount;
    const cycle = (debt.billing_cycle ?? "monthly").toLowerCase();

    const update: Record<string, unknown> = {
      remaining_balance: nextBalance,
      ...advanceMinimumPaymentPatch(debt, nextBalance),
    };
    if (nextBalance === 0 && !debt.date_paid_off) update.date_paid_off = date;

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
    // ADR-075: only non-monthly, non-one-time debts actually roll a due date
    // forward — that's the only case a later payment could be misattributed to.
    let resolvedDueDate: string | null = null;
    if (cycle === "one_time") {
      // ADR-048: a one-time charge never rolls — it closes out when it hits zero.
      update.payment_status = nextBalance === 0 ? "cleared" : "unpaid";
    } else if (cycle !== "monthly") {
      resolvedDueDate = debt.next_due_date ?? null;
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

    // ADR-057/076/078: overflow beyond the cycle minimum reduces arrears —
    // whether that arrears came from a manual opening_arrears carry-in or
    // purely from the live missed-cycle walk. Tracked via a running
    // arrears_paid_to_date counter (ADR-078), not opening_arrears/
    // arrears_as_of — those can only suppress a PREFIX of the missed-cycle
    // walk, the wrong shape for what an overflow payment consolidates.
    const cycleCredit = target > 0 ? Math.max(0, target - previouslyPaid) : clearedAmount;
    const overflow = Math.max(0, clearedAmount - cycleCredit);
    if (overflow > 0.005) {
      update.arrears_paid_to_date = Number(debt.arrears_paid_to_date ?? 0) + overflow;
    }

    await updateRow("debts", p.id, update);
    if (resolvedDueDate) await tagResolvedCycle("debt", p.id, resolvedDueDate);
    return { next_due_date: nextDue, resolved_due_date: resolvedDueDate ?? undefined };
  }

  const bill = p.bill!;
  const dueThisCycle = billCycleDue(bill);

  // ADR-057/076: bills have no prepayment-credit field — cap the payment at
  // what's actually owed (current cycle remainder + arrears, whether that
  // arrears is a manual opening_arrears carry-in or purely from missed cycles).
  const previouslyPaid = Number(bill.cycle_paid_to_date ?? 0);
  const remainingThisCycle = Math.max(0, dueThisCycle - previouslyPaid);
  const maxAllowed = remainingThisCycle + priorArrears;
  if (maxAllowed > 0.005 && clearedAmount > maxAllowed + 0.005) {
    throw new Error(
      `This exceeds what the bill and its arrears currently owe (${formatMoney(maxAllowed)}) — reduce the amount, or log the extra as a separate manual transaction.`,
    );
  }

  const paid = previouslyPaid + clearedAmount;

  if (paid + 0.005 < dueThisCycle) {
    await updateRow("bills", bill.id, {
      payment_status: "pending",
      cycle_paid_to_date: paid,
      cycle_amount_due: dueThisCycle,
    });
    return { remaining_owed: dueThisCycle - paid };
  }

  // Cycle satisfied — compute arrears overflow before resetting.
  const cycleCredit = remainingThisCycle;
  const overflow = Math.max(0, clearedAmount - cycleCredit);
  // ADR-075: the due date this resolve is about to advance past.
  const resolvedDueDate = bill.next_due_date ?? null;
  const billUpdate: Record<string, unknown> = {
    payment_status: "unpaid",
    next_due_date: advanceDate(bill.next_due_date ?? todayISO(), bill.billing_cycle, bill.cycle_interval_days),
    cycle_paid_to_date: 0,
    cycle_amount_due: null,
  };

  // ADR-057/076/078: reduce arrears (manual carry-in or missed-cycle-derived)
  // by the overflow, tracked via the running arrears_paid_to_date counter —
  // see the matching comment in the debt branch above.
  if (overflow > 0.005) {
    billUpdate.arrears_paid_to_date = Number(bill.arrears_paid_to_date ?? 0) + overflow;
  }

  await updateRow("bills", bill.id, billUpdate);
  if (resolvedDueDate) await tagResolvedCycle("bill", bill.id, resolvedDueDate);
  return {
    next_due_date: billUpdate.next_due_date as string,
    resolved_due_date: resolvedDueDate ?? undefined,
  };
}

/**
 * ADR-076/078: credit a payment directly against arrears — cycles strictly
 * before the current one — without touching cycle_paid_to_date or the
 * current cycle's own state. Tracked via the running arrears_paid_to_date
 * counter (ADR-078), not opening_arrears/arrears_as_of — see the matching
 * comment in applyClearedPayment's overflow handling. `priorArrears` is
 * computed by the caller via `priorCyclesArrears()` (arrears.ts) to avoid a
 * circular import (arrears.ts already imports from this module).
 */
export async function applyArrearsPayment(p: Payable, amount: number, priorArrears: number) {
  if (!(amount > 0.005)) throw new Error("Enter a positive amount");
  if (amount > priorArrears + 0.005) {
    throw new Error(
      `This exceeds what's owed from before the current cycle (${formatMoney(priorArrears)}) — reduce the amount, or pay the current cycle through Submit/Clear.`,
    );
  }
  const row = p.kind === "bill" ? p.bill : p.debt;
  await updateRow(table(p.kind), p.id, {
    arrears_paid_to_date: Number(row?.arrears_paid_to_date ?? 0) + amount,
  });
}

export type ArrearsPayInput = {
  payable: Payable;
  accountId: string;
  amount: number;
  /** ADR-076: caller-computed via priorCyclesArrears() (arrears.ts). */
  priorArrears: number;
  /** ADR-076/075: caller-computed via arrearsPaymentTag() (arrears.ts). */
  resolvedTag: string | null;
  /** Payment date; defaults to today when omitted — lets it be backdated. */
  date?: string;
};

/** "Log arrears payment" (ADR-076): a payment against arrears only. */
export function useMarkArrearsPaid() {
  const { householdId } = useAuth();
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({
      payable,
      accountId,
      amount,
      priorArrears,
      resolvedTag,
      date,
    }: ArrearsPayInput) => {
      // Payable write first (ADR-037): a failed/blocked update aborts before
      // any ledger row gets written.
      await applyArrearsPayment(payable, amount, priorArrears);
      const { error } = await supabase.from("transactions").insert({
        household_id: householdId,
        account_id: accountId,
        category_id: payable.category_id,
        amount: -Math.abs(amount),
        status: "cleared",
        description: `Arrears payment · ${payable.name}`,
        transaction_date: date || todayISO(),
        [linkColumn(payable.kind)]: payable.id,
        resolved_cycle_due_date: resolvedTag,
        // ADR-065: default the place from the linked bill's/debt's own institution.
        institution_id: payable.institution_id,
      });
      if (error) throw error;
    },
    onSuccess: done,
  });
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

/** Whether a fee amount is large enough to write its own ledger row (ADR-046). */
function hasFee(fee: number | undefined): boolean {
  return Math.abs(Number(fee) || 0) >= 0.005;
}

/**
 * ADR-046: fees land in the household's "Fees" category. Auto-create it if it
 * doesn't exist so fee rows are always categorised.
 */
async function feeCategoryId(householdId: string | null | undefined) {
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
  return feeCatId ?? null;
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
  /** Matches the paired payment's date; defaults to today when omitted. */
  date?: string,
) {
  if (!hasFee(fee)) return;
  const amt = Math.abs(Number(fee) || 0);
  const feeCatId = await feeCategoryId(householdId);
  const { error } = await supabase.from("transactions").insert({
    household_id: householdId,
    account_id: accountId,
    category_id: feeCatId ?? null,
    amount: -amt,
    status,
    description: `Fee: ${p.name}`,
    transaction_date: date || todayISO(),
    // Paired to the payment, NOT linked to the payable — see ADR-046 note above.
    split_group_id: splitGroupId ?? null,
    // ADR-065: inherit the payable's own institution, same as the payment row.
    institution_id: p.institution_id,
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
    mutationFn: async ({ payable, accountId, amount, cycleAmount, fee, date }: PayInput) => {
      const p = await ensureCycleAmount(payable, cycleAmount);
      const amt = Math.abs(Number(amount ?? payableRemainingOwed(p) ?? p.amount) || 0);
      // Mark the payable pending first so a failed status write never leaves an
      // orphan ledger row behind.
      await updateRow(table(p.kind), p.id, { payment_status: "pending" });
      // ADR-046: pair the payment with its fee via a shared split_group_id so a
      // later clear/undo/reset touches both atomically. No fee → no group: a
      // lone payment row must stay a plain transaction, not a 1-line "split".
      const groupId = hasFee(fee) ? crypto.randomUUID() : null;
      const { error } = await supabase.from("transactions").insert({
        household_id: householdId,
        account_id: accountId,
        category_id: p.category_id,
        amount: -amt,
        status: "pending",
        description: `${p.kind === "bill" ? "Bill" : "Debt"} payment · ${p.name}`,
        transaction_date: date || todayISO(),
        [linkColumn(p.kind)]: p.id,
        split_group_id: groupId,
        // ADR-065: default the place from the linked bill's/debt's own institution.
        institution_id: p.institution_id,
      });
      if (error) throw error;

      await insertFeeTransaction(householdId, p, accountId, fee, "pending", groupId, date);

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
    mutationFn: async ({
      payable,
      accountId,
      amount,
      cycleAmount,
      fee,
      date,
      priorArrears,
    }: PayInput) => {
      const p = await ensureCycleAmount(payable, cycleAmount);
      const requested = Math.abs(Number(amount ?? payableRemainingOwed(p) ?? p.amount) || 0);
      const existing = await findLinkedTransaction(p, "pending");
      const clearedAmount = existing ? Math.abs(Number(existing.amount ?? requested)) : requested;

      // Update the bill/debt FIRST: if that fails we bail out before touching the
      // ledger, instead of stranding a cleared transaction with no effect.
      const result = await applyClearedPayment(p, clearedAmount, priorArrears ?? 0, date || todayISO());

      // ADR-075: this write happens after applyClearedPayment already ran, so
      // it's not caught by that function's own bulk tag — tag it here if this
      // clear resolved the cycle.
      if (existing) {
        const { error } = await supabase
          .from("transactions")
          .update({
            status: "cleared",
            ...(result.resolved_due_date ? { resolved_cycle_due_date: result.resolved_due_date } : {}),
          })
          .eq("id", existing.id);
        if (error) throw error;
        // ADR-046: a fee submitted alongside this payment is still pending —
        // clear it too so it doesn't strand when the payment clears.
        await clearPairedFees(existing.split_group_id);
      } else {
        // Direct clear (no prior submit): insert a cleared payment, paired with
        // any fee entered on this clear via split_group_id. No fee → no group.
        const groupId = hasFee(fee) ? crypto.randomUUID() : null;
        const { error } = await supabase.from("transactions").insert({
          household_id: householdId,
          account_id: accountId,
          category_id: p.category_id,
          amount: -requested,
          status: "cleared",
          description: `${p.kind === "bill" ? "Bill" : "Debt"} payment · ${p.name}`,
          transaction_date: date || todayISO(),
          [linkColumn(p.kind)]: p.id,
          split_group_id: groupId,
          resolved_cycle_due_date: result.resolved_due_date ?? null,
          // ADR-065: default the place from the linked bill's/debt's own institution.
          institution_id: p.institution_id,
        });
        if (error) throw error;
        await insertFeeTransaction(householdId, p, accountId, fee, "cleared", groupId, date);
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
      if (wasCleared && bill) {
        const amount = Math.abs(Number(tx?.amount ?? p.amount));
        const paid = Number(bill.cycle_paid_to_date ?? 0);
        if (paid > 0) {
          // Reversing a partial payment: stay in the same cycle, just take it back off.
          const next = Math.max(0, paid - amount);
          update.cycle_paid_to_date = next;
          if (next === 0 && !bill.is_variable_amount) {
            // ADR-058 addendum: rebuild from any active adjustment rather than
            // blanking — a null here silently drops the adjustment's effect.
            update.cycle_amount_due = rebuiltCycleAmountDue(
              bill,
              await fetchBillAdjustments(bill.id),
              bill.next_due_date,
            );
          }
        } else if (bill.next_due_date) {
          // The clear rolled the bill into its next cycle — undo that roll-forward.
          const revertedDue = reverseDate(
            bill.next_due_date,
            bill.billing_cycle,
            bill.cycle_interval_days,
          );
          update.next_due_date = revertedDue;
          update.cycle_paid_to_date = 0;
          update.cycle_amount_due = rebuiltCycleAmountDue(
            bill,
            await fetchBillAdjustments(bill.id),
            revertedDue,
          );
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
      // The cycle we're returning the bill to: the reversed due date when the
      // clear had already rolled it forward, otherwise the current one.
      const restoredDue =
        resolved && bill.next_due_date
          ? reverseDate(bill.next_due_date, bill.billing_cycle, bill.cycle_interval_days)
          : bill.next_due_date;
      // ADR-058 addendum: rebuild cycle_amount_due from any active adjustment
      // for that cycle instead of blanking it (returns null when there is
      // none, so a plain bill resets exactly as before).
      const rebuiltDue = rebuiltCycleAmountDue(
        bill,
        await fetchBillAdjustments(bill.id),
        restoredDue,
      );
      const update: Record<string, unknown> = {
        payment_status: "unpaid",
        cycle_paid_to_date: 0,
        cycle_amount_due: rebuiltDue,
      };
      if (resolved && bill.next_due_date) {
        update.next_due_date = restoredDue;
      }
      const { error } = await supabase.from("bills").update(update).eq("id", payable.id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}

/**
 * ADR-070: reverse a cleared bill/debt payment. The original ledger row is left
 * intact for history; the payable is rolled back and an offsetting cleared
 * transaction is written.
 *
 * Order matters (ADR-037): the payable write goes first through `updateRow`, so
 * a blocked/silent 0-row update aborts before any reversal row exists.
 */
export function useReversePayment() {
  const { householdId } = useAuth();
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({
      transaction,
      payable,
      date,
    }: {
      transaction: Transaction;
      payable: Payable;
      date?: string;
    }) => {
      const amt = Math.abs(Number(transaction.amount ?? 0));
      if (!(amt > 0)) throw new Error("This transaction has no amount to reverse.");

      if (payable.kind === "bill") {
        const bill = payable.bill!;
        const paid = Math.max(0, Number(bill.cycle_paid_to_date ?? 0) - amt);
        const due = bill.cycle_amount_due != null ? Number(bill.cycle_amount_due) : Number(bill.amount || 0);
        const update: Record<string, unknown> = { cycle_paid_to_date: paid };
        if (paid + 0.005 < due) update.payment_status = "unpaid";
        await updateRow("bills", payable.id, update);
      } else {
        const debt = payable.debt!;
        const paid = Math.max(0, Number(debt.cycle_paid_to_date ?? 0) - amt);
        const due = debtCycleDue(debt);
        const nextBalance = Number(debt.remaining_balance ?? 0) + amt;
        const update: Record<string, unknown> = {
          remaining_balance: nextBalance,
          cycle_paid_to_date: paid,
          ...advanceMinimumPaymentPatch(debt, nextBalance),
        };
        if (paid + 0.005 < due) update.payment_status = "unpaid";
        if (debt.date_paid_off) update.date_paid_off = null;
        await updateRow("debts", payable.id, update);
      }

      const { error } = await supabase.from("transactions").insert({
        household_id: transaction.household_id ?? householdId,
        account_id: transaction.account_id,
        category_id: transaction.category_id ?? payable.category_id,
        amount: -Number(transaction.amount ?? 0),
        status: "cleared",
        description: `Reversed: ${payable.name} payment`,
        transaction_date: date || todayISO(),
        [linkColumn(payable.kind)]: payable.id,
        institution_id: transaction.institution_id ?? payable.institution_id,
      });
      if (error) throw error;
    },
    onSuccess: done,
  });
}

export type CorrectPaymentInput = {
  transaction: Transaction;
  payable: Payable;
  amount: number;
  date: string;
  accountId: string;
};

/**
 * ADR-077: fix a wrong amount/date/account on an already-cleared, linked
 * PARTIAL payment in place — no delete, no reversal row. Only safe when
 * neither the stored cycle total before nor after the correction would
 * meet/cross the cycle's due amount (i.e. no resolve boundary is crossed in
 * either direction). Anything that would cross one is rejected — Reverse
 * (ADR-070) already handles that case safely, this one doesn't try to.
 */
export function useCorrectPayment() {
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({ transaction, payable, amount, date, accountId }: CorrectPaymentInput) => {
      if (!(amount > 0.005)) throw new Error("Enter a positive amount");
      if (transaction.status !== "cleared") {
        throw new Error("Only a cleared payment can be corrected.");
      }
      if (transaction.resolved_cycle_due_date) {
        throw new Error(
          "This payment already resolved a past cycle — correcting it here isn't supported. Reverse it, then redo the payment.",
        );
      }

      const originalAmount = Math.abs(Number(transaction.amount ?? 0));

      if (payable.kind === "debt") {
        const debt = payable.debt!;
        const due = debtCycleDue(debt);
        const paidBefore = Number(debt.cycle_paid_to_date ?? 0);
        if (originalAmount > paidBefore + 0.005) {
          throw new Error(
            "This transaction doesn't match the debt's current partial total — use Reverse instead.",
          );
        }
        if (paidBefore + 0.005 >= due) {
          throw new Error(
            "This cycle is already fully paid — correcting a payment that resolved it isn't supported here. Reverse it, then redo the payment.",
          );
        }
        const paidAfter = paidBefore - originalAmount + amount;
        if (paidAfter + 0.005 >= due) {
          throw new Error(
            `That amount would fully pay off the cycle (due ${formatMoney(due)}) — correcting across a resolve isn't supported here. Reverse the original payment, then redo it through Submit/Clear.`,
          );
        }
        const newRemaining = Math.max(
          0,
          Number(debt.remaining_balance ?? 0) + (originalAmount - amount),
        );
        await updateRow("debts", payable.id, {
          cycle_paid_to_date: paidAfter,
          remaining_balance: newRemaining,
          ...advanceMinimumPaymentPatch(debt, newRemaining),
        });
      } else {
        const bill = payable.bill!;
        const due = billCycleDue(bill);
        const paidBefore = Number(bill.cycle_paid_to_date ?? 0);
        if (originalAmount > paidBefore + 0.005) {
          throw new Error(
            "This transaction doesn't match the bill's current partial total — use Reverse instead.",
          );
        }
        if (paidBefore + 0.005 >= due) {
          throw new Error(
            "This cycle is already fully paid — correcting a payment that resolved it isn't supported here. Reverse it, then redo the payment.",
          );
        }
        const paidAfter = paidBefore - originalAmount + amount;
        if (paidAfter + 0.005 >= due) {
          throw new Error(
            `That amount would fully pay off the cycle (due ${formatMoney(due)}) — correcting across a resolve isn't supported here. Reverse the original payment, then redo it through Submit/Clear.`,
          );
        }
        await updateRow("bills", payable.id, { cycle_paid_to_date: paidAfter });
      }

      const { error } = await supabase
        .from("transactions")
        .update({
          amount: Number(transaction.amount) < 0 ? -amount : amount,
          transaction_date: date,
          account_id: accountId,
        })
        .eq("id", transaction.id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}

/* ------------------------------------------------------------------------ */
/* Log a debt payment (historical or current cycle) — ADR-079                */
/* ------------------------------------------------------------------------ */

/** One fee/interest/charge line entered alongside a logged debt payment. */
export type DebtPaymentLine = {
  /** e.g. "fee", "interest", "late_fee" — free-form label used in the description. */
  type: string;
  amount: number;
  note?: string | null;
};

export type LogDebtPaymentInput = {
  debt: Debt;
  accountId: string;
  /** Principal portion — the only part that moves the debt balance. */
  principal: number;
  /** Payment date (YYYY-MM-DD). Decides in-cycle vs historical handling. */
  date: string;
  status: "pending" | "cleared";
  lines: DebtPaymentLine[];
  /** priorCyclesArrears(payable) from arrears.ts — only used for the in-cycle path. */
  priorArrears: number;
};

/**
 * Start of the debt's current cycle window: one cycle back from its current
 * due date. Falls back to the first of the current month when the debt has no
 * due date (plain monthly debts).
 */
export function debtCycleWindowStart(debt: Debt, today = todayISO()): string {
  const due = debt.next_due_date ? String(debt.next_due_date).slice(0, 10) : null;
  if (!due) return `${today.slice(0, 7)}-01`;
  return (
    shiftDateSafe(due, debt.billing_cycle ?? "monthly", -1, debt.cycle_interval_days) ??
    `${today.slice(0, 7)}-01`
  );
}

/**
 * ADR-079: a logged payment dated inside the current cycle window behaves like
 * a normal payment (cycle counters, status, due-date roll). Anything earlier is
 * a historical backfill — ledger + balance only.
 */
export function isWithinCurrentCycle(debt: Debt, date: string, today = todayISO()): boolean {
  return date >= debtCycleWindowStart(debt, today);
}

/**
 * ADR-079: one form, one write — a (possibly backdated) debt payment plus any
 * number of fee/interest lines. Only the principal touches remaining_balance;
 * every extra line is its own ledger row against the same account so the
 * account balance is right, but the debt balance is untouched (fees/interest
 * are ledger-only until a real interest engine exists).
 */
export function useLogDebtPayment() {
  const { householdId } = useAuth();
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({
      debt,
      accountId,
      principal,
      date,
      status,
      lines,
      priorArrears,
    }: LogDebtPaymentInput) => {
      const p = toPayable("debt", debt);
      const amt = Math.abs(Number(principal) || 0);
      const extras = (lines ?? []).filter((l) => Math.abs(Number(l.amount) || 0) >= 0.005);
      const groupId = extras.length > 0 ? crypto.randomUUID() : null;
      const inCycle = isWithinCurrentCycle(debt, date);

      let resolvedDueDate: string | null = null;

      // Payable-first (ADR-037): the debt row moves before any ledger row exists.
      if (amt > 0.005) {
        if (status === "cleared") {
          if (inCycle) {
            const res = await applyClearedPayment(p, amt, priorArrears ?? 0, date);
            resolvedDueDate = res.resolved_due_date ?? null;
          } else {
            // Historical: balance only. Cycle counters, status and due date stay put.
            const remaining = Number(debt.remaining_balance ?? 0);
            const nextBalance = Math.max(0, remaining - amt);
            await updateRow("debts", debt.id, {
              remaining_balance: nextBalance,
              ...advanceMinimumPaymentPatch(debt, nextBalance),
              ...(nextBalance === 0 && !debt.date_paid_off ? { date_paid_off: date } : {}),
            });
          }
        } else if (inCycle) {
          await updateRow("debts", debt.id, { payment_status: "pending" });
        }
      }

      if (amt > 0.005) {
        const { error } = await supabase.from("transactions").insert({
          household_id: householdId,
          account_id: accountId,
          category_id: p.category_id,
          amount: -amt,
          status,
          description: `Debt payment · ${debt.name}`,
          transaction_date: date,
          linked_debt_id: debt.id,
          split_group_id: groupId,
          resolved_cycle_due_date: resolvedDueDate,
          institution_id: p.institution_id,
        });
        if (error) throw error;
      }

      if (extras.length > 0) {
        const feeCatId = await feeCategoryId(householdId);
        const rows = extras.map((l) => ({
          household_id: householdId,
          account_id: accountId,
          category_id: feeCatId,
          amount: -Math.abs(Number(l.amount) || 0),
          status,
          // "Fee:" prefix keeps these rows inside the ADR-046 paired-fee helpers
          // (clearPairedFees / deletePairedFees) so they follow the payment.
          description: `Fee: ${debt.name} · ${l.type}${l.note ? ` — ${l.note}` : ""}`,
          transaction_date: date,
          split_group_id: groupId,
          institution_id: p.institution_id,
        }));
        const { error } = await supabase.from("transactions").insert(rows);
        if (error) throw error;
      }

      return { inCycle };
    },
    onSuccess: done,
  });
}
