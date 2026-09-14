import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type Bill, type BillAdjustment, type Debt, type Transaction } from "./supabase";
import { advanceDate, reverseDate, shiftDateSafe, formatMoney } from "./format";
import { useAuth } from "./auth-context";
import { debtPayoffDatePatch } from "./debt-payoff-state";

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
   * ADR-100: the date this payment actually cleared/posted — only meaningful
   * for useMarkCleared, and only when clearing a row that was already
   * pending (the one moment "today" is real new information distinct from
   * `date`, which is that row's original transaction_date). Defaults to
   * today when omitted. A direct clear (no prior pending row) has no
   * separate prompt for this — `date` is used for both columns.
   */
  clearedDate?: string;
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
 * ADR-056 addendum: the money-in row `useCreateAdvance` writes into the
 * destination account. It carries `linked_debt_id` (so it shows in the debt's
 * Recent Transactions) but it is a DISBURSEMENT, never a repayment — every
 * "amount paid" / cycle-progress calculation must skip it. Identified by the
 * positive amount + the "Advance: <name>" description the hook and the
 * ADR-056-addendum backfill both write.
 */
export function isAdvanceDisbursement(
  t: Pick<Transaction, "amount" | "description" | "linked_debt_id">,
): boolean {
  return (
    !!t.linked_debt_id &&
    Number(t.amount ?? 0) > 0 &&
    (t.description ?? "").trim().toLowerCase().startsWith("advance:")
  );
}

/**
 * ADR-046: a "Fee: …" row is a payment fee / advance fee — it rides alongside a
 * payment but never credits the cycle. They're normally written unlinked; a
 * linked one (e.g. an advance's express fee, ADR-056 addendum) must still be
 * kept out of cycle math. Matches `clearPairedFees`' `ilike 'Fee:%'`.
 */
export function isFeeTransaction(t: Pick<Transaction, "description">): boolean {
  return (t.description ?? "").trimStart().toLowerCase().startsWith("fee:");
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
  // ADR-101 addendum (Issue #66): the shortfall/cycle-satisfied/arrears/
  // due-date-roll state transition now runs as one atomic Postgres
  // statement (apply_cleared_debt_payment / apply_cleared_bill_payment,
  // scripts/migrations/2026-09-13-atomic-cleared-payment-rpcs.sql) instead
  // of a client-side read-then-write — two cleared payments submitted close
  // together on the same row now serialize instead of one clobbering the
  // other. priorArrears stays a caller-computed parameter (see the
  // migration header for why that's still in scope).
  if (p.kind === "debt") {
    const { data, error } = await supabase.rpc("apply_cleared_debt_payment", {
      p_debt_id: p.id,
      p_cleared_amount: clearedAmount,
      p_date: date,
    });
    if (error) throw error;
    const row = data?.[0];
    if (row?.resolved_due_date) await tagResolvedCycle("debt", p.id, row.resolved_due_date);
    // Only one of remaining_owed/next_due_date is ever populated, matching
    // the two separate early-return branches this replaced.
    return {
      remaining_owed: row?.remaining_owed ?? undefined,
      next_due_date: row?.remaining_owed != null ? undefined : (row?.next_due_date ?? null),
      resolved_due_date: row?.resolved_due_date ?? undefined,
    };
  }

  const bill = p.bill!;
  // Fast, friendly client-side pre-check (unchanged from before) — avoids a
  // round trip for the obviously-invalid case. The RPC re-checks the same
  // cap atomically and is the actual source of truth for concurrent calls.
  const dueThisCycle = billCycleDue(bill);
  const previouslyPaid = Number(bill.cycle_paid_to_date ?? 0);
  const remainingThisCycle = Math.max(0, dueThisCycle - previouslyPaid);
  const maxAllowed = remainingThisCycle + priorArrears;
  if (maxAllowed > 0.005 && clearedAmount > maxAllowed + 0.005) {
    throw new Error(
      `This exceeds what the bill and its arrears currently owe (${formatMoney(maxAllowed)}) — reduce the amount, or log the extra as a separate manual transaction.`,
    );
  }

  const { data, error } = await supabase.rpc("apply_cleared_bill_payment", {
    p_bill_id: bill.id,
    p_cleared_amount: clearedAmount,
    p_prior_arrears: priorArrears,
    p_date: date,
  });
  if (error) {
    const m = /CLEARED_PAYMENT_EXCEEDS_MAX ([\d.]+)/.exec(error.message ?? "");
    if (m) {
      throw new Error(
        `This exceeds what the bill and its arrears currently owe (${formatMoney(Number(m[1]))}) — reduce the amount, or log the extra as a separate manual transaction.`,
      );
    }
    throw error;
  }
  const row = data?.[0];
  if (row?.resolved_due_date) await tagResolvedCycle("bill", bill.id, row.resolved_due_date);
  return {
    remaining_owed: row?.remaining_owed ?? undefined,
    next_due_date: row?.remaining_owed != null ? undefined : (row?.next_due_date ?? null),
    resolved_due_date: row?.resolved_due_date ?? undefined,
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
export function hasFee(fee: number | undefined): boolean {
  return Math.abs(Number(fee) || 0) >= 0.005;
}

/**
 * ADR-046: fees land in the household's "Fees" category. Auto-create it if it
 * doesn't exist so fee rows are always categorised.
 */
export async function feeCategoryId(householdId: string | null | undefined) {
  let feeCatId = (await supabase
    .from("categories")
    .select("id")
    .eq("household_id", householdId!)
    .ilike("name", "fees")
    .limit(1)).data?.[0]?.id;
  if (!feeCatId && householdId) {
    const { data: created, error: catErr } = await supabase
      .from("categories")
      // ADR-069: domain is NOT NULL live (docs/SCHEMA.md undersells this) — a
      // fee is real spending, so it gets the "spending" domain like any other
      // spending category.
      .insert({ household_id: householdId, name: "Fees", domain: "spending" })
      .select("id")
      .single();
    if (catErr) throw catErr;
    feeCatId = created?.id ?? null;
  }
  return feeCatId ?? null;
}


/**
 * ADR-046: fees ride alongside a payment as their own ledger row so they hit the
 * account balance without ever counting toward the bill/debt cycle. Reused by
 * ADR-097 for transfer fees (label/institutionId taken from the caller instead
 * of a Payable, since a transfer has no bill/debt to read them from).
 *
 * ADR-046 fix: the fee is PAIRED to its payment via `split_group_id` (never via
 * linked_bill_id/linked_debt_id) so cycle math — clearedSum, state derivation,
 * debt balance reversal — never sees it. That keeps clearing, reversing and
 * deleting atomic: any operation on the payment propagates to its fee.
 */
export async function insertFeeTransaction(
  householdId: string | null | undefined,
  /** e.g. a bill/debt's name, or a transfer's description. Used in "Fee: <label>". */
  label: string,
  /** e.g. a bill/debt's institution_id, or a transfer's from-account institution. */
  institutionId: string | null | undefined,
  accountId: string,
  fee: number | undefined,
  status: "pending" | "cleared",
  /** Shared with the paired row(s) so the group stays atomic. */
  splitGroupId?: string | null,
  /** Matches the paired row's date; defaults to today when omitted. */
  date?: string,
  /** ADR-100: when inserted directly as "cleared", the date it cleared — defaults to `date`. Ignored for a "pending" insert. */
  clearedDate?: string,
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
    description: `Fee: ${label}`,
    transaction_date: date || todayISO(),
    cleared_date: status === "cleared" ? (clearedDate || date || todayISO()) : null,
    // Paired to the payment/transfer, NOT linked to the payable — see ADR-046 note above.
    split_group_id: splitGroupId ?? null,
    // ADR-065: inherit the paired row's own institution.
    institution_id: institutionId,
  });
  if (error) throw error;
}

/**
 * ADR-103: the purchase side of a "Cash Back" combo entry — one or more
 * categorized rows on the from-account, paired to a Cash transfer via
 * `split_group_id = <the transfer's transfer_group_id>`. Generalizes
 * `insertFeeTransaction` above from one fixed-category amount to N
 * caller-categorized lines; always written (never a no-op like the fee
 * helper), since a Cash Back entry with no purchase lines is just a
 * plain transfer.
 */
export async function insertCashBackPurchaseRows(
  householdId: string | null | undefined,
  accountId: string,
  groupId: string,
  lines: { categoryId: string | null; amount: number }[],
  description: string | null,
  institutionId: string | null | undefined,
  date: string,
) {
  const rows = lines.map((l) => ({
    household_id: householdId,
    account_id: accountId,
    category_id: l.categoryId,
    amount: -Math.abs(Number(l.amount) || 0),
    status: "cleared" as const,
    description,
    transaction_date: date,
    cleared_date: date,
    split_group_id: groupId,
    institution_id: institutionId ?? null,
  }));
  const { error } = await supabase.from("transactions").insert(rows);
  if (error) throw error;
}

/**
 * Clear every pending fee row paired with a payment (same split_group_id).
 * Called when a submitted payment is marked cleared so the fee clears too.
 */
async function clearPairedFees(splitGroupId: string | null | undefined, clearedDate: string) {
  if (!splitGroupId) return;
  const { error } = await supabase
    .from("transactions")
    .update({ status: "cleared", cleared_date: clearedDate })
    .eq("status", "pending")
    .eq("split_group_id", splitGroupId)
    .ilike("description", "Fee:%");
  if (error) throw error;
}

/**
 * Delete every fee row paired with a payment or transfer (same
 * split_group_id). Called on undo/reset (and ADR-097 transfer delete) so a
 * reversed payment/transfer takes its fee with it.
 */
export async function deletePairedFees(splitGroupId: string | null | undefined) {
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
 * ADR-058 addendum: set a variable bill's `cycle_amount_due` directly, ahead
 * of any payment — e.g. the statement posts a known total days before the
 * due date. A plain overwrite (works whether the field is currently null or
 * already set by a prior payment/prompt), no `bill_adjustments` row and no
 * transaction — unlike that table, this isn't a real-world event with its
 * own trail, just the raw target number. `cycle_paid_to_date` is untouched.
 *
 * 2026-09-14 addendum: rejected once `cycle_paid_to_date` already meets or
 * exceeds the new target. This tool never rolls `next_due_date` or tags the
 * paying transaction's `resolved_cycle_due_date` (ADR-075) — only a real
 * payment through Submit/Clear does that. Allowing a value at/below what's
 * already cleared made the cycle *display* as Cleared without ever actually
 * resolving, which unravels the moment the amount is edited again (the ATT
 * incident this addendum fixes) and leaves `next_due_date` stuck.
 */
export function useSetBillCycleAmountDue() {
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({ bill, amount }: { bill: Bill; amount: number }) => {
      const value = Math.max(0, Number(amount) || 0);
      const paid = Number(bill.cycle_paid_to_date ?? 0);
      if (paid > 0.005 && value <= paid + 0.005) {
        throw new Error(
          `This cycle already has ${formatMoney(paid)} cleared toward it — setting the target at or below that wouldn't properly resolve the cycle (the due date won't roll). Log the remaining payment through Submit/Clear instead, or use Correct/Reverse on the existing payment if its amount was wrong.`,
        );
      }
      await updateRow("bills", bill.id, { cycle_amount_due: value });
    },
    onSuccess: done,
  });
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

      await insertFeeTransaction(householdId, p.name, p.institution_id, accountId, fee, "pending", groupId, date);

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
      clearedDate,
      priorArrears,
    }: PayInput) => {
      const p = await ensureCycleAmount(payable, cycleAmount);
      const requested = Math.abs(Number(amount ?? payableRemainingOwed(p) ?? p.amount) || 0);
      const existing = await findLinkedTransaction(p, "pending");
      const clearedAmount = existing ? Math.abs(Number(existing.amount ?? requested)) : requested;
      // ADR-100: the date this actually cleared — explicit `clearedDate` when
      // clearing an already-pending row, else the entered `date` (a direct
      // clear/insert has one date shared by both columns).
      const effectiveClearedDate = clearedDate || date || todayISO();

      // Update the bill/debt FIRST: if that fails we bail out before touching the
      // ledger, instead of stranding a cleared transaction with no effect.
      const result = await applyClearedPayment(p, clearedAmount, priorArrears ?? 0, effectiveClearedDate);

      // ADR-075: this write happens after applyClearedPayment already ran, so
      // it's not caught by that function's own bulk tag — tag it here if this
      // clear resolved the cycle.
      if (existing) {
        const { error } = await supabase
          .from("transactions")
          .update({
            status: "cleared",
            cleared_date: effectiveClearedDate,
            ...(result.resolved_due_date ? { resolved_cycle_due_date: result.resolved_due_date } : {}),
          })
          .eq("id", existing.id);
        if (error) throw error;
        // ADR-046: a fee submitted alongside this payment is still pending —
        // clear it too so it doesn't strand when the payment clears.
        await clearPairedFees(existing.split_group_id, effectiveClearedDate);
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
          cleared_date: effectiveClearedDate,
          [linkColumn(p.kind)]: p.id,
          split_group_id: groupId,
          resolved_cycle_due_date: result.resolved_due_date ?? null,
          // ADR-065: default the place from the linked bill's/debt's own institution.
          institution_id: p.institution_id,
        });
        if (error) throw error;
        await insertFeeTransaction(
          householdId,
          p.name,
          p.institution_id,
          accountId,
          fee,
          "cleared",
          groupId,
          date,
          effectiveClearedDate,
        );
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
          ...debtPayoffDatePatch(
            debt,
            Number(debt.remaining_balance ?? 0) + clearedTotal,
          ),
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
          ...debtPayoffDatePatch(debt, nextBalance),
        };
        if (paid + 0.005 < due) update.payment_status = "unpaid";
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
        cleared_date: date || todayISO(),
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
          ...debtPayoffDatePatch(debt, newRemaining, date),
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
          // ADR-100: this only ever corrects an already-cleared row with one
          // date field — move cleared_date along with it.
          cleared_date: date,
          account_id: accountId,
        })
        .eq("id", transaction.id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}

/* ------------------------------------------------------------------------ */
/* ADR-091: one Edit for a linked transaction                                */
/* ------------------------------------------------------------------------ */

/** Re-read a bill/debt straight from the DB so payable math starts from truth. */
async function fetchPayable(kind: PayableKind, id: string): Promise<Payable> {
  const { data, error } = await supabase.from(table(kind)).select("*").eq("id", id).single();
  if (error) throw error;
  if (!data) throw new Error(`That ${kind} no longer exists.`);
  return toPayable(kind, data as Bill | Debt);
}

/**
 * ADR-091: undo the payable-side effect of one cleared payment WITHOUT writing
 * an offsetting ledger row (that's `useReversePayment`'s job). Used as the
 * first half of rollback-then-reapply when a linked transaction is edited.
 *
 * When the payment resolved a cycle (`resolved_cycle_due_date`), the due date
 * it rolled past is restored exactly instead of being guessed backwards.
 */
export async function rollbackClearedPayment(
  p: Payable,
  amount: number,
  resolvedDueDate?: string | null,
) {
  const amt = Math.abs(amount);
  if (p.kind === "bill") {
    const bill = p.bill!;
    const paid = Math.max(0, Number(bill.cycle_paid_to_date ?? 0) - amt);
    const update: Record<string, unknown> = { cycle_paid_to_date: paid };
    if (resolvedDueDate) {
      // The resolve rolled the cycle forward and cleared the counters — put the
      // cycle back where it was and credit whatever else had been paid into it.
      update.next_due_date = resolvedDueDate;
      update.cycle_paid_to_date = 0;
      update.payment_status = "unpaid";
    } else if (paid + 0.005 < billCycleDue(bill)) {
      update.payment_status = paid > 0.005 ? "pending" : "unpaid";
    }
    await updateRow("bills", p.id, update);
    return;
  }
  const debt = p.debt!;
  const paid = Math.max(0, Number(debt.cycle_paid_to_date ?? 0) - amt);
  const nextBalance = Number(debt.remaining_balance ?? 0) + amt;
  const update: Record<string, unknown> = {
    remaining_balance: nextBalance,
    cycle_paid_to_date: paid,
    ...advanceMinimumPaymentPatch(debt, nextBalance),
    ...debtPayoffDatePatch(debt, nextBalance),
  };
  if (resolvedDueDate) {
    update.next_due_date = resolvedDueDate;
    update.cycle_paid_to_date = 0;
    update.payment_status = "unpaid";
  } else if (paid + 0.005 < debtCycleDue(debt)) {
    update.payment_status = paid > 0.005 ? "pending" : "unpaid";
  }
  await updateRow("debts", p.id, update);
}

export type EditLinkedTransactionInput = {
  transaction: Transaction;
  kind: PayableKind;
  payableId: string;
  /** Positive magnitude of the payment. */
  amount: number;
  date: string;
  status: "pending" | "cleared";
  /** ADR-100: the date this actually cleared — only meaningful when `status` is "cleared". */
  clearedDate?: string | null;
  accountId: string | null;
  categoryId?: string | null;
  institutionId?: string | null;
  description?: string | null;
};

/**
 * ADR-091: the single "Edit" behind a bill/debt-linked transaction. Instead of
 * refusing edits that cross the paid/unpaid boundary (the old ADR-077 Correct),
 * it rolls the payable back by the transaction's previous cleared effect and
 * re-applies the new one, payable-first (ADR-037). Status changes are handled
 * the same way: cleared → pending only rolls back, pending → cleared only
 * applies.
 */
export function useEditLinkedTransaction() {
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async (input: EditLinkedTransactionInput) => {
      const { transaction, kind, payableId } = input;
      const newAmount = Math.abs(Number(input.amount));
      if (!(newAmount > 0.005)) throw new Error("Enter a positive amount");

      const wasCleared = transaction.status === "cleared";
      const willClear = input.status === "cleared";
      const oldAmount = Math.abs(Number(transaction.amount ?? 0));
      const sign = Number(transaction.amount ?? 0) > 0 ? 1 : -1;

      if (wasCleared) {
        const before = await fetchPayable(kind, payableId);
        await rollbackClearedPayment(before, oldAmount, transaction.resolved_cycle_due_date);
        if (transaction.resolved_cycle_due_date) {
          // Drop the stale resolve tag BEFORE re-applying, so applyClearedPayment
          // can re-tag this row if the new amount resolves a cycle again.
          const { error: untagError } = await supabase
            .from("transactions")
            .update({ resolved_cycle_due_date: null })
            .eq("id", transaction.id);
          if (untagError) throw untagError;
        }
      }
      // ADR-100: the date this actually cleared — the edit form's own
      // clearedDate when given, else whatever the row already had (a plain
      // amount/account edit on an already-cleared row), else the entered
      // date (a fresh pending→cleared transition with no explicit pick).
      const effectiveClearedDate = input.clearedDate || transaction.cleared_date || input.date;

      if (willClear) {
        const mid = await fetchPayable(kind, payableId);
        await applyClearedPayment(mid, newAmount, 0, effectiveClearedDate);
      }

      const patch: Record<string, unknown> = {
        amount: sign * newAmount,
        transaction_date: input.date,
        status: input.status,
        cleared_date: willClear ? effectiveClearedDate : null,
        account_id: input.accountId,
        description: input.description ?? null,
      };
      if (input.categoryId !== undefined) patch.category_id = input.categoryId;
      if (input.institutionId !== undefined) patch.institution_id = input.institutionId;


      const { error } = await supabase.from("transactions").update(patch).eq("id", transaction.id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}

/* ------------------------------------------------------------------------ */

/* Log a debt payment (historical or current cycle) — ADR-084                */
/* ------------------------------------------------------------------------ */

/** One fee/interest/charge line entered alongside a logged debt payment. */
/** Shared by debt and bill payments (ADR-084 addendum). */
export type PaymentLine = {
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
  lines: PaymentLine[];
  /** priorCyclesArrears(payable) from arrears.ts — only used for the in-cycle path. */
  priorArrears: number;
  /**
   * ADR-084 addendum: the date of this debt's most recent 'advance' adjustment,
   * if any (`adjustment_date`). Lets the historical path recognise a payment
   * that settles an already-closed advance cycle and keep it ledger-only.
   */
  newestAdvanceDate?: string | null;
};

/**
 * Start of the debt's current cycle window: one cycle back from its current
 * due date. Falls back to the first of the current month when the debt has no
 * due date (plain monthly debts).
 */
export function debtCycleWindowStart(debt: Debt, today = todayISO()): string {
  const due = debt.next_due_date ? String(debt.next_due_date).slice(0, 10) : null;
  if (!due) return `${today.slice(0, 7)}-01`;
  return shiftDateSafe(due, debt.billing_cycle ?? "monthly", -1, debt.cycle_interval_days);
}

/**
 * ADR-084: a logged payment dated inside the current cycle window behaves like
 * a normal payment (cycle counters, status, due-date roll). Anything earlier is
 * a historical backfill — ledger + balance only.
 */
export function isWithinCurrentCycle(debt: Debt, date: string, today = todayISO()): boolean {
  return date >= debtCycleWindowStart(debt, today);
}

/**
 * ADR-084 addendum: an advance-type debt keeps ONE running balance covering the
 * current advance; older advances are already settled. So a historical payment
 * dated before this debt's most recent advance is repaying a closed advance —
 * it must NOT touch `remaining_balance` / `minimum_payment`. The ledger row is
 * still written so the paying account stays accurate ("ledger-only").
 */
export function isPreAdvanceHistoricalPayment(
  debt: Debt,
  date: string,
  newestAdvanceDate: string | null | undefined,
  today = todayISO(),
): boolean {
  return (
    debt.debt_type === "advance" &&
    !isWithinCurrentCycle(debt, date, today) &&
    !!newestAdvanceDate &&
    date < String(newestAdvanceDate).slice(0, 10)
  );
}

/**
 * ADR-084: one form, one write — a (possibly backdated) debt payment plus any
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
      debt: staleDebt,
      accountId,
      principal,
      date,
      status,
      lines,
      priorArrears,
      newestAdvanceDate,
    }: LogDebtPaymentInput) => {
      // ADR-101 addendum: applyClearedPayment's in-cycle branch isn't
      // atomic (full cycle-satisfied/arrears/due-date-roll logic — too big a
      // rewrite for that pass), but a fresh fetch right before using it
      // closes the most common real trigger: a normal "draw an advance, then
      // pay" session where the form's debt prop was captured before the
      // advance landed. Doesn't make concurrent submissions safe, but the
      // window shrinks from "however long the page has been open" to one
      // round trip.
      const { data: fresh, error: freshErr } = await supabase
        .from("debts")
        .select("*")
        .eq("id", staleDebt.id)
        .single();
      if (freshErr) throw freshErr;
      const debt = fresh as Debt;
      const p = toPayable("debt", debt);
      const amt = Math.abs(Number(principal) || 0);
      const extras = (lines ?? []).filter((l) => Math.abs(Number(l.amount) || 0) >= 0.005);
      const groupId = extras.length > 0 ? crypto.randomUUID() : null;
      const inCycle = isWithinCurrentCycle(debt, date);
      // ADR-084 addendum: a pre-advance historical payment is ledger-only — the
      // running balance still reflects the current advance.
      const ledgerOnly = isPreAdvanceHistoricalPayment(debt, date, newestAdvanceDate);

      let resolvedDueDate: string | null = null;

      // Payable-first (ADR-037): the debt row moves before any ledger row exists.
      if (amt > 0.005) {
        if (status === "cleared") {
          if (inCycle) {
            const res = await applyClearedPayment(p, amt, priorArrears ?? 0, date);
            resolvedDueDate = res.resolved_due_date ?? null;
          } else if (!ledgerOnly) {
            // Historical: balance only. Cycle counters, status and due date
            // stay put. ADR-101: atomic RPC, same shape as a debt adjustment
            // with a negative amount.
            const { error } = await supabase.rpc("apply_debt_adjustment", {
              p_debt_id: debt.id,
              p_amount: -amt,
              p_effective_date: date,
            });
            if (error) throw error;
          }
        } else if (inCycle) {
          await updateRow("debts", debt.id, { payment_status: "pending" });
        }
      }

      // ADR-102: when this debt's balance lives on a real account (e.g.
      // "Dave ExtraCash"), pair the payment with a mirror credit there —
      // same transfer_group_id, so the transfer-title UI (ADR-098) shows
      // "Checking -> Dave ExtraCash" and the linked account's history
      // actually reflects the repayment. No linked_debt_id on the mirror:
      // the real payment row above already carries it, and cycle math must
      // only count that one, not both.
      const mirrorGroupId = amt > 0.005 && debt.linked_account_id ? crypto.randomUUID() : null;

      if (amt > 0.005) {
        const { error } = await supabase.from("transactions").insert({
          household_id: householdId,
          account_id: accountId,
          category_id: p.category_id,
          amount: -amt,
          status,
          description: `Debt payment · ${debt.name}`,
          transaction_date: date,
          cleared_date: status === "cleared" ? date : null,
          linked_debt_id: debt.id,
          split_group_id: groupId,
          resolved_cycle_due_date: resolvedDueDate,
          institution_id: p.institution_id,
          transfer_group_id: mirrorGroupId,
        });
        if (error) throw error;
      }

      if (mirrorGroupId && debt.linked_account_id) {
        const { error } = await supabase.from("transactions").insert({
          household_id: householdId,
          account_id: debt.linked_account_id,
          amount: amt,
          status,
          description: `Debt payment · ${debt.name}`,
          transaction_date: date,
          cleared_date: status === "cleared" ? date : null,
          transfer_group_id: mirrorGroupId,
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
          cleared_date: status === "cleared" ? date : null,
          split_group_id: groupId,
          institution_id: p.institution_id,
        }));
        const { error } = await supabase.from("transactions").insert(rows);
        if (error) throw error;
      }

      return { inCycle, ledgerOnly };
    },
    onSuccess: done,
  });
}

/* ------------------------------------------------------------------------ */
/* Log a bill payment (historical or current cycle) — ADR-084 addendum       */
/* (bill equivalent of the debt version above)                               */
/* ------------------------------------------------------------------------ */

export type LogBillPaymentInput = {
  bill: Bill;
  accountId: string;
  amount: number;
  /** Payment date (YYYY-MM-DD). Decides in-cycle vs elapsed-cycle handling. */
  date: string;
  status: "pending" | "cleared";
  /** priorCyclesArrears(payable) from arrears.ts — only used for the in-cycle path. */
  priorArrears: number;
  /** ADR-084 addendum: fee/interest lines, same shape as debt payments. */
  lines: PaymentLine[];
};

/**
 * Start of the bill's current cycle window. ADR-086: a monthly bill's cycle is
 * the calendar month containing `today`, not a window hung off next_due_date —
 * it resets on the 1st regardless of the due day. Non-monthly bills keep the
 * next_due_date-anchored rolling window (mirrors debtCycleWindowStart).
 */
export function billCycleWindowStart(bill: Bill, today = todayISO()): string {
  const cycle = (bill.billing_cycle ?? "monthly").toLowerCase().replace(/[\s_-]/g, "");
  if (cycle === "monthly") return `${today.slice(0, 7)}-01`;
  const due = bill.next_due_date ? String(bill.next_due_date).slice(0, 10) : null;
  if (!due) return `${today.slice(0, 7)}-01`;
  return shiftDateSafe(due, bill.billing_cycle, -1, bill.cycle_interval_days);
}

/**
 * ADR-048: a one-time bill has a single open cycle with no historical concept —
 * every date is "in cycle". Otherwise: on/after the cycle's window start.
 */
export function isWithinCurrentBillCycle(bill: Bill, date: string, today = todayISO()): boolean {
  const cycle = (bill.billing_cycle ?? "monthly").toLowerCase().replace(/[\s_-]/g, "");
  if (cycle === "onetime") return true;
  return date >= billCycleWindowStart(bill, today);
}

/**
 * Issue #57 / bill equivalent of `useLogDebtPayment`: one form, one write for
 * a (possibly backdated) bill payment plus any number of fee/interest lines
 * (ADR-084 addendum). A date inside the current cycle window runs the normal
 * `applyClearedPayment()` path; an elapsed-cycle date writes a plain ledger
 * row and leaves the bill's own cycle fields untouched — bills have no
 * running balance for a historical payment to reduce, unlike debts. Fee
 * lines never touch the bill's cycle/status, same as debt fee lines never
 * touch remaining_balance.
 */
export function useLogBillPayment() {
  const { householdId } = useAuth();
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({
      bill,
      accountId,
      amount,
      date,
      status,
      priorArrears,
      lines,
    }: LogBillPaymentInput) => {
      const p = toPayable("bill", bill);
      const amt = Math.abs(Number(amount) || 0);
      const extras = (lines ?? []).filter((l) => Math.abs(Number(l.amount) || 0) >= 0.005);
      if (amt <= 0.005 && extras.length === 0) throw new Error("Enter an amount");
      const inCycle = isWithinCurrentBillCycle(bill, date);
      const groupId = extras.length > 0 ? crypto.randomUUID() : null;

      let resolvedDueDate: string | null = null;
      // Payable-first (ADR-037): the bill row moves before any ledger row exists.
      if (amt > 0.005 && inCycle) {
        if (status === "cleared") {
          const res = await applyClearedPayment(p, amt, priorArrears ?? 0, date);
          resolvedDueDate = res.resolved_due_date ?? null;
        } else {
          await updateRow("bills", bill.id, { payment_status: "pending" });
        }
      }
      // Elapsed cycle: ledger-only — current cycle counters/status/due date untouched.

      if (amt > 0.005) {
        const { error } = await supabase.from("transactions").insert({
          household_id: householdId,
          account_id: accountId,
          category_id: p.category_id,
          amount: -amt,
          status,
          description: `Bill payment · ${bill.name}`,
          transaction_date: date,
          cleared_date: status === "cleared" ? date : null,
          linked_bill_id: bill.id,
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
          description: `Fee: ${bill.name} · ${l.type}${l.note ? ` — ${l.note}` : ""}`,
          transaction_date: date,
          cleared_date: status === "cleared" ? date : null,
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

/* ------------------------------------------------------------------------ */
/* Sync stored status columns to the ledger-derived state                    */
/* ------------------------------------------------------------------------ */

/**
 * The stored `payment_status` / `cycle_paid_to_date` columns can drift from the
 * ADR-036 ledger derivation (e.g. a historical/backdated payment writes the
 * balance but leaves an old "pending" behind). This writes the derived state
 * back onto the row so every screen reading the raw columns agrees again.
 * Derivation stays the source of truth — this never invents state.
 */
export function useSyncStoredStatus() {
  const done = useAfterPayment();
  return useMutation({
    mutationFn: async ({
      p,
      state,
      clearedSum,
    }: {
      p: Payable;
      state: "unpaid" | "pending" | "partial" | "cleared";
      clearedSum: number;
    }) => {
      await updateRow(table(p.kind), p.id, {
        // 'partial' isn't a stored value — the columns only carry the tap state.
        payment_status: state === "partial" ? "unpaid" : state,
        cycle_paid_to_date: state === "cleared" ? 0 : Math.max(0, clearedSum),
      });
    },
    onSuccess: done,
  });
}
