import type { Account, AccountBalance, Debt, DebtAdjustment, Transaction } from "./supabase";
import { isAdvanceDisbursement, isArrearsOnlyPayment, isFeeTransaction } from "./payments";
import { balanceAsOf } from "./net-worth";
import { creditOwed } from "./balances";
import { todayISO } from "./snapshot";

export type AdvanceEpisodeStatus = "open" | "repaid" | "carried_forward";

/**
 * ADR-111: one advance "episode" — a single draw, from disbursement through
 * any fees to repayment — for a `debt_type='advance'` debt. Advances on a
 * debt are always sequential, never overlapping (confirmed with the user
 * after the 2026-08-24 OnePay Advance incident, ADR-084 addendum): a debt
 * can only have one open advance at a time. This is a read-only history view
 * over those sequential draws, not a change to that model.
 */
export type AdvanceEpisode = {
  /** The debt_adjustments row (adjustment_type='advance') that opened this
   * episode; null for the "before tracking" bucket (events that predate the
   * earliest advance marker — a real gap found on OnePay Advance). */
  markerId: string | null;
  startDate: string;
  /** Exclusive; null when this is the still-open, most recent episode. */
  endDate: string | null;
  /** This window's own draw amount (0 for the pre-tracking bucket, unless an
   * orphaned disbursement predates the first marker — the real OnePay case). */
  advanceAmount: number;
  /** Fees incurred within this window only. */
  feesTotal: number;
  /** Repaid within this window only. */
  repaidTotal: number;
  /** Running balance at the end of this episode: the unpaid remainder from
   * every prior episode plus this one's own advanceAmount + feesTotal, minus
   * repaidTotal, floored at 0 — a debt carries one continuous balance
   * (confirmed single-open-advance model), so an underpaid draw's shortfall
   * rolls into the next one instead of resetting. */
  net: number;
  status: AdvanceEpisodeStatus;
  /** In-window transactions, for an expandable detail view. */
  transactions: Transaction[];
  /** In-window non-advance adjustments (fees/corrections), for display. */
  adjustments: DebtAdjustment[];
};

/** `date` + `created_at` as one lexicographically-comparable string (ISO
 * dates/timestamps sort correctly as plain strings). Deliberately excludes
 * any row id — when two events genuinely tie on both (the real case: two
 * Dave ExtraCash $50 draws both dated 2026-09-04 with no `created_at`),
 * there is no meaningful causal signal left to break the tie with, so a
 * content item tying with a window's END boundary consistently falls into
 * the NEXT episode rather than depending on arbitrary id-string ordering. */
function dateCreatedKey(date: string, created: string | null | undefined): string {
  return `${date.slice(0, 10)}T${created ?? ""}`;
}

/** True when `key` falls within `[lower, upper)` — `upper === null` means open-ended. */
function inWindow(key: string, lower: string, upper: string | null): boolean {
  if (key < lower) return false;
  if (upper !== null && key >= upper) return false;
  return true;
}

type Marker = { adjustment: DebtAdjustment; key: string };

/**
 * Splits a window's non-disbursement content into { feesTotal, repaidTotal }
 * for the unlinked branch, matching `debtBalanceAsOf`'s `balance += amount`
 * sign convention (negative reduces what's owed, positive increases it) but
 * decomposed into two display buckets instead of one running sum:
 * - A `"Fee: "`-prefixed transaction always counts as an owed-increase
 *   (abs amount), regardless of sign weirdness — unlike `debtBalanceAsOf`,
 *   which drops these entirely (per ADR-110 design, surfaced here on purpose).
 * - Any other content: negative amount -> repaidTotal; positive amount ->
 *   feesTotal. A positive non-fee amount is rare but real — e.g. a reversed
 *   repayment (ADR-008) restoring what was paid — and must increase net the
 *   same way a fee does, not be silently dropped.
 * - A non-marker `debt_adjustments` row contributes by its own sign the same
 *   way (positive = owed increase, e.g. `late_fee`; negative = owed decrease,
 *   e.g. `insurance_covered`).
 */
function splitFeesAndRepaid(
  content: Transaction[],
  nonMarkerAdjustments: DebtAdjustment[],
): { feesTotal: number; repaidTotal: number } {
  let feesTotal = 0;
  let repaidTotal = 0;
  for (const t of content) {
    const amt = Number(t.amount);
    if (isFeeTransaction(t)) feesTotal += Math.abs(amt);
    else if (amt > 0) feesTotal += amt;
    else if (amt < 0) repaidTotal += Math.abs(amt);
  }
  for (const a of nonMarkerAdjustments) {
    const amt = Number(a.amount);
    if (amt > 0) feesTotal += amt;
    else if (amt < 0) repaidTotal += Math.abs(amt);
  }
  return { feesTotal, repaidTotal };
}

/** A window's raw, independent contribution — before the running-balance
 * carry-forward pass that turns these into final `AdvanceEpisode`s. */
type RawWindow = {
  markerId: string | null;
  startDate: string;
  endDate: string | null;
  advanceAmount: number;
  feesTotal: number;
  repaidTotal: number;
  transactions: Transaction[];
  adjustments: DebtAdjustment[];
};

/**
 * Threads a running balance through chronologically-ordered windows so an
 * underpaid draw's shortfall carries into the next one(s), matching the
 * real single-running-balance model instead of resetting every window to 0.
 *
 * Status is resolved RETROACTIVELY: a window only ever knows "did the carry
 * return to zero by my own end boundary" in isolation, but a real shortfall
 * can legitimately get absorbed one or more windows later (e.g. a payment
 * landing inside the *next* window rather than exactly at this one's own
 * boundary — confirmed on Dave ExtraCash's real history, where the $40
 * 7/17 draw's shortfall is cleared by a payment dated 7/31, inside the
 * following window). Whenever carry hits zero at window i, every window
 * back to the last resolution point gets marked "repaid" too, not just
 * window i itself — "carried_forward" only survives for a window whose
 * shortfall is still outstanding by the very end of the chain (i.e. it
 * never got resolved before the final, still-open window).
 */
function applyCarryForward(windows: RawWindow[]): AdvanceEpisode[] {
  const results: AdvanceEpisode[] = windows.map((w) => ({
    ...w,
    net: 0,
    status: "carried_forward" as AdvanceEpisodeStatus,
  }));
  let carry = 0;
  let pendingSince = 0;
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const net = Math.max(0, carry + w.advanceAmount + w.feesTotal - w.repaidTotal);
    carry = net;
    results[i].net = net;
    const isLast = i === windows.length - 1;
    if (isLast) {
      results[i].status = net > 0.005 ? "open" : "repaid";
    } else if (net <= 0.005) {
      for (let j = pendingSince; j <= i; j++) results[j].status = "repaid";
      pendingSince = i + 1;
    }
  }
  return results;
}

/**
 * Partitions a `debt_type='advance'` debt's history into per-advance
 * episodes. `debt_adjustments` rows with `adjustment_type='advance'` are the
 * boundary markers — written unconditionally for every advance debt whether
 * or not it's linked to a real account (ADR-102), so no new schema is
 * needed. Returns `[]` for a non-advance debt or one with no advance history
 * yet (the caller falls back to an empty-state).
 *
 * Linked debts (`debt.linked_account_id` set) sum the account's OWN
 * transaction history in each window, PLUS any other `linked_debt_id`-tagged
 * transaction for this debt found on a DIFFERENT account — necessary
 * because the account is usually only linked partway through a debt's real
 * history (ADR-102): every advance/repayment from before that point was
 * logged the old way, tagged to the debt but never mirrored onto its
 * account, and is otherwise invisible to an account-only sum. Confirmed live
 * on Dave ExtraCash: real $75/$25/$25/$105 payments logged on Checking,
 * tagged to this debt, fully explain how $275 of old advances is already
 * settled — an account-only sum saw none of them and treated every one of
 * those advances as still outstanding. A tagged transaction that shares a
 * `transfer_group_id` with one already counted via the account's own history
 * is skipped — it's the other leg of an already-mirrored pair, and counting
 * both would double the event. `isArrearsOnlyPayment` rows are excluded
 * entirely: they only ever move `arrears_paid_to_date` (ADR-076), never
 * principal — confirmed live that including one broke an otherwise-exact
 * reconciliation.
 *
 * The LAST (still-open) episode's `net` is overridden to match
 * `effectiveDebtBalance()` exactly, via the same `balanceAsOf()` the rest of
 * the app already uses — found necessary live against Dave ExtraCash's real
 * data: naively replaying the carry-forward chain from the very first advance
 * ignores any `account_balances` snapshot anchor taken partway through (a
 * deliberate balance-correction checkpoint), producing a wildly inflated
 * number instead of the one figure users will actually cross-check against
 * the Debt card's own displayed balance. Earlier (closed) episodes keep the
 * merged-content chain — informational history, not something users compare
 * live. Requires `accounts`/`accountBalances` to apply; falls back to the
 * naive value when a caller doesn't have that data (e.g. existing unit
 * fixtures).
 *
 * Unlinked debts (e.g. OnePay Advance) have no backing account, so content
 * comes from `linked_debt_id`-tagged transactions plus non-marker
 * `debt_adjustments` rows — the same two sources `debt-history.ts`'s
 * `debtBalanceAsOf` already uses, just partitioned per advance instead of
 * summed for the whole debt.
 */
export function computeAdvanceEpisodes(
  debt: Pick<Debt, "id" | "debt_type" | "linked_account_id">,
  adjustments: DebtAdjustment[],
  transactions: Transaction[],
  accounts: Account[] = [],
  accountBalances: AccountBalance[] = [],
): AdvanceEpisode[] {
  if (debt.debt_type !== "advance") return [];

  const debtAdjustments = adjustments.filter((a) => a.debt_id === debt.id);
  const markers: Marker[] = debtAdjustments
    .filter((a) => a.adjustment_type === "advance")
    .map((a) => ({ adjustment: a, key: dateCreatedKey(a.adjustment_date, a.created_at) }))
    // Stable tie-break for markers sharing the exact same (date, created_at)
    // — only matters for the relative order of draws made on the same day;
    // doesn't affect where other content gets bucketed (see dateCreatedKey).
    .sort((x, y) =>
      x.key !== y.key ? (x.key < y.key ? -1 : 1) : x.adjustment.id < y.adjustment.id ? -1 : 1,
    );
  if (markers.length === 0) return [];

  const nonMarkerAdjustments = debtAdjustments.filter((a) => a.adjustment_type !== "advance");
  const firstKey = markers[0].key;
  const windows: RawWindow[] = [];

  if (debt.linked_account_id) {
    const accountTx = transactions.filter(
      (t) => t.account_id === debt.linked_account_id && t.status === "cleared",
    );
    const accountTransferGroups = new Set(
      accountTx.map((t) => t.transfer_group_id).filter((g): g is string => !!g),
    );
    // Any other transaction tagged to this debt, on a DIFFERENT account —
    // real pre-link history (or any other never-mirrored entry). Excludes
    // disbursements (already counted via the marker's own advanceAmount),
    // arrears-only rows (never affect principal), and the other leg of a
    // pair already represented via accountTx.
    const crossAccountTx = transactions.filter(
      (t) =>
        t.linked_debt_id === debt.id &&
        t.status === "cleared" &&
        t.account_id !== debt.linked_account_id &&
        !isAdvanceDisbursement(t) &&
        !isArrearsOnlyPayment(t) &&
        !(t.transfer_group_id && accountTransferGroups.has(t.transfer_group_id)),
    );
    // Consume exactly one disbursement-mirror transaction per marker (same
    // amount, opposite sign, same date), in marker order — the deterministic
    // tie-break for a same-day double-advance.
    const consumed = new Set<string>();
    for (const m of markers) {
      const match = accountTx.find(
        (t) =>
          !consumed.has(t.id) &&
          Number(t.amount) === -Number(m.adjustment.amount) &&
          t.transaction_date.slice(0, 10) === m.adjustment.adjustment_date.slice(0, 10),
      );
      if (match) consumed.add(match.id);
    }
    const remainingAccountTx = accountTx.filter((t) => !consumed.has(t.id));
    const txKey = (t: Transaction) =>
      dateCreatedKey(t.cleared_date ?? t.transaction_date, t.created_at);
    const adjKey = (a: DebtAdjustment) => dateCreatedKey(a.adjustment_date, a.created_at);

    // accountTx entries keep the account-centric convention (positive =
    // repaid, negative = fee); crossAccountTx entries use the paying
    // account's own convention (negative = repaid, positive = fee) — the
    // same one debt-history.ts's debtBalanceAsOf/splitFeesAndRepaid already
    // use for tagged transactions. Mixing them up would silently invert half
    // the totals.
    function accountCentricSplit(tx: Transaction[]): { feesTotal: number; repaidTotal: number } {
      let feesTotal = 0;
      let repaidTotal = 0;
      for (const t of tx) {
        const amt = Number(t.amount);
        if (amt > 0) repaidTotal += amt;
        else if (amt < 0) feesTotal += Math.abs(amt);
      }
      return { feesTotal, repaidTotal };
    }
    function payingAccountSplit(tx: Transaction[]): { feesTotal: number; repaidTotal: number } {
      let feesTotal = 0;
      let repaidTotal = 0;
      for (const t of tx) {
        const amt = Number(t.amount);
        if (amt < 0) repaidTotal += Math.abs(amt);
        else if (amt > 0) feesTotal += amt;
      }
      return { feesTotal, repaidTotal };
    }
    // A non-marker adjustment with no mirror on record contributes directly
    // — it's the one case (the two pre-mirroring-convention "Overdraft Fee"
    // rows found live on Dave ExtraCash) where nothing on any account
    // already represents it. A mirrored adjustment is skipped here: its
    // mirror transaction is already in accountTx, counting both would
    // double it.
    function unmirroredAdjustmentSplit(adj: DebtAdjustment[]): {
      feesTotal: number;
      repaidTotal: number;
    } {
      let feesTotal = 0;
      let repaidTotal = 0;
      for (const a of adj) {
        if (a.mirror_transaction_id) continue;
        const amt = Number(a.amount);
        if (amt > 0) feesTotal += amt;
        else if (amt < 0) repaidTotal += Math.abs(amt);
      }
      return { feesTotal, repaidTotal };
    }

    const preAccountTx = remainingAccountTx.filter((t) => txKey(t) < firstKey);
    const preCrossTx = crossAccountTx.filter((t) => txKey(t) < firstKey);
    const preAdj = nonMarkerAdjustments.filter((a) => adjKey(a) < firstKey);
    if (preAccountTx.length > 0 || preCrossTx.length > 0 || preAdj.length > 0) {
      const a1 = accountCentricSplit(preAccountTx);
      const a2 = payingAccountSplit(preCrossTx);
      const a3 = unmirroredAdjustmentSplit(preAdj);
      const d = markers[0].adjustment.adjustment_date.slice(0, 10);
      windows.push({
        markerId: null,
        startDate: d,
        endDate: d,
        advanceAmount: 0,
        feesTotal: a1.feesTotal + a2.feesTotal + a3.feesTotal,
        repaidTotal: a1.repaidTotal + a2.repaidTotal + a3.repaidTotal,
        transactions: [...preAccountTx, ...preCrossTx],
        adjustments: preAdj,
      });
    }
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const next = markers[i + 1] ?? null;
      const inWindowAccountTx = remainingAccountTx.filter((t) =>
        inWindow(txKey(t), m.key, next?.key ?? null),
      );
      const inWindowCrossTx = crossAccountTx.filter((t) =>
        inWindow(txKey(t), m.key, next?.key ?? null),
      );
      const inWindowAdj = nonMarkerAdjustments.filter((a) =>
        inWindow(adjKey(a), m.key, next?.key ?? null),
      );
      const a1 = accountCentricSplit(inWindowAccountTx);
      const a2 = payingAccountSplit(inWindowCrossTx);
      const a3 = unmirroredAdjustmentSplit(inWindowAdj);
      windows.push({
        markerId: m.adjustment.id,
        startDate: m.adjustment.adjustment_date.slice(0, 10),
        endDate: next ? next.adjustment.adjustment_date.slice(0, 10) : null,
        advanceAmount: Number(m.adjustment.amount),
        feesTotal: a1.feesTotal + a2.feesTotal + a3.feesTotal,
        repaidTotal: a1.repaidTotal + a2.repaidTotal + a3.repaidTotal,
        transactions: [...inWindowAccountTx, ...inWindowCrossTx],
        adjustments: inWindowAdj,
      });
    }
    const linkedEpisodes = applyCarryForward(windows);
    const account = accounts.find((a) => a.id === debt.linked_account_id);
    if (account && linkedEpisodes.length > 0) {
      const liveNet = creditOwed(balanceAsOf(account, accountBalances, transactions, todayISO()));
      const last = linkedEpisodes[linkedEpisodes.length - 1];
      last.net = liveNet;
      last.status = liveNet > 0.005 ? "open" : "repaid";
    }
    return linkedEpisodes;
  }

  // Unlinked: linked_debt_id-tagged transactions + non-marker adjustments,
  // same sources debt-history.ts's debtBalanceAsOf already uses.
  const debtTx = transactions.filter((t) => t.linked_debt_id === debt.id && t.status === "cleared");
  const disbursements = debtTx.filter((t) => isAdvanceDisbursement(t));
  const content = debtTx.filter((t) => !isAdvanceDisbursement(t) && !isArrearsOnlyPayment(t));
  const txKey = (t: Transaction) =>
    dateCreatedKey(t.cleared_date ?? t.transaction_date, t.created_at);
  const adjKey = (a: DebtAdjustment) => dateCreatedKey(a.adjustment_date, a.created_at);

  const preDisbursements = disbursements.filter((t) => txKey(t) < firstKey);
  const preContent = content.filter((t) => txKey(t) < firstKey);
  const preAdj = nonMarkerAdjustments.filter(
    (a) => a.affects_balance !== false && adjKey(a) < firstKey,
  );
  if (preDisbursements.length > 0 || preContent.length > 0 || preAdj.length > 0) {
    const advanceAmount = preDisbursements.reduce((s, t) => s + Number(t.amount), 0);
    const { feesTotal, repaidTotal } = splitFeesAndRepaid(preContent, preAdj);
    const d = markers[0].adjustment.adjustment_date.slice(0, 10);
    windows.push({
      markerId: null,
      startDate: d,
      endDate: d,
      advanceAmount,
      feesTotal,
      repaidTotal,
      transactions: [...preDisbursements, ...preContent],
      adjustments: preAdj,
    });
  }

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const next = markers[i + 1] ?? null;
    const inWindowContent = content.filter((t) => inWindow(txKey(t), m.key, next?.key ?? null));
    const inWindowAdj = nonMarkerAdjustments.filter(
      (a) => a.affects_balance !== false && inWindow(adjKey(a), m.key, next?.key ?? null),
    );
    const { feesTotal, repaidTotal } = splitFeesAndRepaid(inWindowContent, inWindowAdj);
    windows.push({
      markerId: m.adjustment.id,
      startDate: m.adjustment.adjustment_date.slice(0, 10),
      endDate: next ? next.adjustment.adjustment_date.slice(0, 10) : null,
      advanceAmount: Number(m.adjustment.amount),
      feesTotal,
      repaidTotal,
      transactions: inWindowContent,
      adjustments: inWindowAdj,
    });
  }
  return applyCarryForward(windows);
}
