import type { Account, AccountBalance, Debt, DebtAdjustment, Transaction } from "./supabase";
import { isArrearsOnlyPayment, isDebtDisbursement, isFeeTransaction } from "./payments";
import { balanceAsOf } from "./net-worth";
import { creditOwed } from "./balances";
import { todayISO } from "./snapshot";

export type AdvanceEpisodeStatus = "open" | "repaid" | "carried_forward";

/**
 * ADR-111 / ADR-111 addendum (2026-11-03, Issue #82): one advance "episode" —
 * a single draw, from disbursement through any fees to repayment — for a
 * `debt_type='advance'` debt. ADR-111 originally assumed advances on a debt
 * are always sequential (one open draw at a time) — confirmed WRONG live on
 * Cleo, which allows several concurrent open draws up to a credit limit.
 * Episodes are now computed by a FIFO allocation walk (`runFifoAllocation`,
 * below) instead of fixed date windows between markers — see that function's
 * doc comment for the model. This remains a read-only history view; nothing
 * about how advances/fees/repayments are logged changes.
 */
export type AdvanceEpisode = {
  /** The debt_adjustments row (adjustment_type='advance') that opened this
   * episode; null for the "before tracking" bucket (events that predate the
   * earliest advance marker — a real gap found on OnePay Advance). */
  markerId: string | null;
  startDate: string;
  /** The date THIS draw's own remaining balance resolved to zero; null while
   * still open. (Before the 2026-11-03 addendum this meant "the date the
   * NEXT marker opened" — a date-window boundary, not a resolution fact;
   * that meaning no longer applies now that each draw tracks its own
   * balance independently.) */
  endDate: string | null;
  /** This draw's own advance amount (0 for the pre-tracking bucket, unless
   * an orphaned disbursement predates the first marker — the real OnePay
   * case). */
  advanceAmount: number;
  /** Fees attributed to this draw specifically (see `resolveFeeMarkerHint`
   * for how attribution works) — excludes ledger-only `"Fee: "` transactions
   * (ADR-084), which still appear in `transactions` for display but never
   * affect this total or `net`, same exclusion as before the addendum. */
  feesTotal: number;
  /** Repaid against this draw specifically. */
  repaidTotal: number;
  /** This draw's OWN remaining balance (floored at 0) — before the 2026-11-03
   * addendum this was the cumulative running balance of the WHOLE debt as of
   * this point in a single shared chain; now each episode's `net` is
   * independent of every other episode's. */
  net: number;
  status: AdvanceEpisodeStatus;
  /** Transactions attributed to this draw, for an expandable detail view. A
   * repayment that FIFO-cascades across multiple draws appears in every
   * draw's list it actually paid down (see `runFifoAllocation`). */
  transactions: Transaction[];
  /** Non-advance adjustments (fees/corrections) attributed to this draw. */
  adjustments: DebtAdjustment[];
};

/** `date` + `created_at` as one lexicographically-comparable string (ISO
 * dates/timestamps sort correctly as plain strings). Deliberately excludes
 * any row id — when two events genuinely tie on both (the real case: two
 * Dave ExtraCash $50 draws both dated 2026-09-04 with no `created_at`),
 * there is no meaningful causal signal left to break the tie with, so a
 * content item tying with a marker's own open-key consistently falls into
 * that marker (opens are processed before same-key content, see
 * `buildTimeline`) rather than depending on arbitrary id-string ordering. */
function dateCreatedKey(date: string, created: string | null | undefined): string {
  return `${date.slice(0, 10)}T${created ?? ""}`;
}

type Marker = { adjustment: DebtAdjustment; key: string };

/**
 * One draw, generalized so the FIFO engine doesn't need to know whether it's
 * a real `debt_adjustments` marker or the synthetic "before tracking" bucket
 * (`id: null`) that holds whatever predates the earliest real marker.
 */
type MarkerRef = {
  id: string | null;
  key: string;
  advanceAmount: number;
  /** Fixed display start date. For the pre-tracking bucket this is forced to
   * the first real marker's date (matches the pre-addendum display, which
   * always showed the bucket as `startDate === endDate === firstMarkerDate`
   * regardless of its own content's actual dates — preserved as-is here,
   * it's cosmetic and wasn't part of what Issue #82 asked to fix). */
  startDate: string;
};

/**
 * One signed event in the FIFO allocation walk — already reduced to a single
 * delta on whichever marker's remaining balance it ends up attributed to,
 * using the EXACT same sign conventions `splitFeesAndRepaid`/
 * `accountCentricSplit`/`payingAccountSplit` used before the addendum
 * (negative delta = reduces what's owed/repayment-like; positive = increases
 * it/fee-like). `affectsBalance: false` is the ADR-084 ledger-only-fee case:
 * still attributed to a specific draw for display, but never changes that
 * draw's `remaining`/`feesTotal`/`repaidTotal`.
 */
type AllocEvent = {
  key: string;
  id: string;
  delta: number;
  affectsBalance: boolean;
  /** Parsed "(M/D advance)" hint from a fee's own description/note, if any
   * — see `resolveFeeMarkerHint`. Only ever set for delta >= 0 (fee-like)
   * events; a repayment never carries one (confirmed: nothing in the data
   * model links a repayment to a specific draw). */
  hintDate: string | null;
  transaction?: Transaction;
  adjustment?: DebtAdjustment;
};

/**
 * Best-effort attribution for a fee event with no structural link to a
 * specific draw (none exists anywhere in the schema — confirmed for both
 * `transactions` and `debt_adjustments` while designing the 2026-11-03
 * addendum). Parses the "(M/D advance)" convention already present in this
 * household's own fee descriptions (e.g. "Fee: Cleo · advance fee — Express
 * fee (10/15 advance)", `src/lib/payments.ts`'s `composeFeeDescription`
 * free-text `note` portion) and matches it against this debt's own markers
 * by month/day. Same family of trick as `isAdvanceDisbursement`/
 * `isFeeTransaction`/`isArrearsOnlyPayment` (description-prefix-as-type-
 * system) — fragile by nature: a future fee logged without this exact
 * phrasing, or an ambiguous month/day shared by two markers, silently falls
 * back to FIFO-oldest-open in the caller. Not a durable guarantee; a real
 * structural link (a new nullable FK column) was considered and deliberately
 * deferred — see the ADR-111 addendum.
 */
function resolveFeeMarkerHint(
  description: string | null | undefined,
  markers: readonly Marker[],
): string | null {
  const m = /\((\d{1,2})\/(\d{1,2})\s+advance\)/i.exec(description ?? "");
  if (!m) return null;
  const [, monStr, dayStr] = m;
  const matches = markers.filter((mk) => {
    const d = mk.adjustment.adjustment_date.slice(0, 10);
    const [, mon, day] = /^\d{4}-(\d{2})-(\d{2})$/.exec(d) ?? [];
    return mon != null && Number(mon) === Number(monStr) && Number(day) === Number(dayStr);
  });
  // Ambiguous (two markers share the same month/day, e.g. across different
  // years) — don't guess, let the caller's FIFO fallback handle it.
  return matches.length === 1 ? matches[0].adjustment.id : null;
}

type MarkerState = {
  ref: MarkerRef;
  remaining: number;
  feesTotal: number;
  repaidTotal: number;
  transactions: Transaction[];
  adjustments: DebtAdjustment[];
  resolvedDate: string | null;
};

type TimelineItem =
  | { kind: "open"; key: string; index: number }
  | { kind: "event"; key: string; event: AllocEvent };

/** Opens sort before same-key content (a same-day fee/repayment belongs to
 * the draw that just opened, not whatever was open before it) — the direct
 * generalization of `dateCreatedKey`'s existing "ties fall into the next
 * thing" convention. Same-key opens (a same-day double-advance) tie-break by
 * marker id ascending; same-key events tie-break by their own row id
 * ascending — both explicit and deterministic, where the pre-addendum code
 * relied on incidental array-concat order. */
function buildTimeline(markerRefs: readonly MarkerRef[], events: readonly AllocEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...markerRefs.map((m, index): TimelineItem => ({ kind: "open", key: m.key, index })),
    ...events.map((event): TimelineItem => ({ kind: "event", key: event.key, event })),
  ];
  items.sort((a, b) => {
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    const rank = (x: TimelineItem) => (x.kind === "open" ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.kind === "open" && b.kind === "open") {
      const aid = markerRefs[a.index].id ?? "";
      const bid = markerRefs[b.index].id ?? "";
      return aid < bid ? -1 : aid > bid ? 1 : 0;
    }
    if (a.kind === "event" && b.kind === "event") {
      return a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0;
    }
    return 0;
  });
  return items;
}

/**
 * Replaces the pre-addendum `applyCarryForward`: instead of threading one
 * cumulative balance through fixed date windows, each draw gets its OWN
 * independent `remaining`, and every fee/repayment is allocated to a
 * specific draw as the walk processes it in true chronological order —
 * nothing is retroactively reinterpreted afterward.
 *
 * Allocation rules:
 * - A repayment (negative delta) is NEVER hinted (nothing links a repayment
 *   to a specific draw) — always FIFO: drains the oldest still-open draw
 *   first, cascading into the next-oldest open draw once the first is fully
 *   zeroed. This makes "the oldest open draw resolves first" a true,
 *   provable property of the algorithm — but it's an allocation CONVENTION,
 *   not a recovered fact; the household's own repayment transactions carry
 *   no signal for which draw they actually closed.
 * - A fee/charge (positive delta) with a resolved `hintDate` match applies
 *   directly to that draw — even one already resolved, which REOPENS it (a
 *   late-assessed fee can genuinely re-inflate a "done" draw; the old model
 *   had no way to represent this at all).
 * - A fee/charge with no hint falls back to the same FIFO-oldest-open rule.
 * - A ledger-only event (`affectsBalance: false`, a "Fee: " transaction,
 *   ADR-084) is attributed the same way (hint, else FIFO-oldest-open) for
 *   DISPLAY only — it never changes `remaining`/`feesTotal`/`repaidTotal`.
 *
 * An overpayment beyond every currently-open draw parks as a pending credit
 * that offsets the very next draw to open (generalizes the pre-addendum
 * un-floored `carry`, now scoped as a scalar between the open-set going
 * empty and the next marker-open event, instead of threaded through every
 * window regardless of whether anything was open).
 */
function runFifoAllocation(markerRefs: readonly MarkerRef[], events: readonly AllocEvent[]): AdvanceEpisode[] {
  const states: MarkerState[] = markerRefs.map((ref) => ({
    ref,
    remaining: 0,
    feesTotal: 0,
    repaidTotal: 0,
    transactions: [],
    adjustments: [],
    resolvedDate: null,
  }));
  const idIndex = new Map<string, number>();
  markerRefs.forEach((m, i) => {
    if (m.id) idIndex.set(m.id, i);
  });

  const openSet: number[] = []; // front = oldest still-open draw
  const inOpenSet = new Set<number>();
  let lastOpenedIndex = -1;
  let unspentCredit = 0; // >0 = shortfall waiting for the next draw to open; <0 = credit that will offset it

  function openFront(i: number) {
    if (!inOpenSet.has(i)) {
      openSet.unshift(i);
      inOpenSet.add(i);
    }
  }
  function openBack(i: number) {
    if (!inOpenSet.has(i)) {
      openSet.push(i);
      inOpenSet.add(i);
    }
  }
  function closeMarker(i: number, dateKey: string) {
    const idx = openSet.indexOf(i);
    if (idx !== -1) openSet.splice(idx, 1);
    inOpenSet.delete(i);
    states[i].resolvedDate = dateKey.slice(0, 10);
  }

  function attachDisplay(i: number, event: AllocEvent) {
    if (event.transaction) states[i].transactions.push(event.transaction);
    if (event.adjustment) states[i].adjustments.push(event.adjustment);
  }

  /** Where an event with no FIFO-affecting target yet (a hint, or the
   * "attribute to whoever's oldest-open" default) should land. */
  function resolveTarget(event: AllocEvent): number {
    if (event.hintDate) {
      const hinted = idIndex.get(event.hintDate);
      if (hinted != null) return hinted;
    }
    if (openSet.length > 0) return openSet[0];
    return lastOpenedIndex >= 0 ? lastOpenedIndex : states.length - 1;
  }

  for (const item of buildTimeline(markerRefs, events)) {
    if (item.kind === "open") {
      const i = item.index;
      const s = states[i];
      s.remaining = s.ref.advanceAmount;
      if (unspentCredit !== 0) {
        s.remaining += unspentCredit;
        unspentCredit = 0;
      }
      lastOpenedIndex = i;
      if (s.remaining > 0.005) openBack(i);
      else s.resolvedDate = s.ref.key.slice(0, 10);
      continue;
    }

    const { event } = item;
    if (!event.affectsBalance) {
      attachDisplay(resolveTarget(event), event);
      continue;
    }

    if (event.delta < 0) {
      let left = -event.delta;
      const touched: number[] = [];
      while (left > 0.005 && openSet.length > 0) {
        const i = openSet[0];
        const s = states[i];
        const applied = Math.min(left, s.remaining);
        s.remaining -= applied;
        s.repaidTotal += applied;
        left -= applied;
        touched.push(i);
        if (s.remaining <= 0.005) closeMarker(i, event.key);
      }
      if (left > 0.005) unspentCredit -= left;
      if (touched.length === 0) touched.push(resolveTarget(event));
      for (const i of touched) attachDisplay(i, event);
      continue;
    }

    // delta > 0: fee/charge-like — hinted draw, else FIFO-oldest-open.
    const i = resolveTarget(event);
    const s = states[i];
    const wasOpen = inOpenSet.has(i);
    s.remaining += event.delta;
    s.feesTotal += event.delta;
    attachDisplay(i, event);
    if (s.remaining > 0.005 && !wasOpen) {
      s.resolvedDate = null;
      openFront(i); // reopened — it's the oldest thing outstanding again
    }
  }

  return states.map((s) => ({
    markerId: s.ref.id,
    startDate: s.ref.startDate,
    endDate: s.resolvedDate,
    advanceAmount: s.ref.advanceAmount,
    feesTotal: s.feesTotal,
    repaidTotal: s.repaidTotal,
    net: Math.max(0, s.remaining),
    status: s.remaining <= 0.005 ? "repaid" : "open",
    transactions: s.transactions,
    adjustments: s.adjustments,
  }));
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
 * transaction history, PLUS any other `linked_debt_id`-tagged transaction for
 * this debt found on a DIFFERENT account — necessary because the account is
 * usually only linked partway through a debt's real history (ADR-102): every
 * advance/repayment from before that point was logged the old way, tagged to
 * the debt but never mirrored onto its account, and is otherwise invisible to
 * an account-only sum. Confirmed live on Dave ExtraCash: real $75/$25/$25/
 * $105 payments logged on Checking, tagged to this debt, fully explain how
 * $275 of old advances is already settled — an account-only sum saw none of
 * them and treated every one of those advances as still outstanding. A
 * tagged transaction that shares a `transfer_group_id` with one already
 * counted via the account's own history is skipped — it's the other leg of
 * an already-mirrored pair, and counting both would double the event.
 * `isArrearsOnlyPayment` rows are excluded entirely: they only ever move
 * `arrears_paid_to_date` (ADR-076), never principal — confirmed live that
 * including one broke an otherwise-exact reconciliation.
 *
 * The LAST (most-recently-opened) episode's `net` is overridden to match
 * `effectiveDebtBalance()` exactly, via the same `balanceAsOf()` the rest of
 * the app already uses — found necessary live against Dave ExtraCash's real
 * data: naively replaying the ledger from the very first advance ignores any
 * `account_balances` snapshot anchor taken partway through (a deliberate
 * balance-correction checkpoint), producing a wildly inflated number instead
 * of the one figure users will actually cross-check against the Debt card's
 * own displayed balance. Earlier episodes keep the FIFO-allocated history —
 * informational, not something users compare live. Requires
 * `accounts`/`accountBalances` to apply; falls back to the FIFO value when a
 * caller doesn't have that data (e.g. existing unit fixtures).
 *
 * Unlinked debts (e.g. Cleo, EarnIn, Instacash/MoneyLion, OnePay Advance)
 * have no backing account, so content comes from `linked_debt_id`-tagged
 * transactions plus non-marker `debt_adjustments` rows — the same two
 * sources `debt-history.ts`'s `debtBalanceAsOf` already uses, just
 * partitioned per draw instead of summed for the whole debt.
 *
 * 2026-11-03 addendum (Issue #82, ADR-111 addendum): both branches used to
 * assume advances are always sequential (one open draw at a time) and
 * bucketed every fee/repayment by which fixed date window it fell in. That's
 * confirmed wrong — see `runFifoAllocation`'s doc comment for the replacement
 * model (each draw gets an independent balance; FIFO-oldest-open allocation,
 * or a parsed date hint for fees). The "pre-tracking" bucket (events before
 * the earliest marker) is now just the first entry in the same FIFO walk
 * (`id: null`), not a separately-computed special case — it behaves exactly
 * like any other draw once opened, it just has no originating
 * `debt_adjustments` row of its own.
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
    // — only matters for the relative open-order of draws made on the same
    // day; doesn't affect where other content gets attributed (FIFO-oldest-
    // open already resolves that independently of marker order ties).
    .sort((x, y) =>
      x.key !== y.key ? (x.key < y.key ? -1 : 1) : x.adjustment.id < y.adjustment.id ? -1 : 1,
    );
  if (markers.length === 0) return [];

  const nonMarkerAdjustments = debtAdjustments.filter((a) => a.adjustment_type !== "advance");
  const firstMarkerDate = markers[0].adjustment.adjustment_date.slice(0, 10);

  function finalize(preAdvanceAmount: number, markerRefs: MarkerRef[], events: AllocEvent[]): AdvanceEpisode[] {
    const allRefs: MarkerRef[] = [
      { id: null, key: "", advanceAmount: preAdvanceAmount, startDate: firstMarkerDate },
      ...markerRefs,
    ];
    const episodes = runFifoAllocation(allRefs, events);
    // Drop the pre-tracking episode when nothing actually predates the first
    // marker — matches the pre-addendum inclusion condition exactly (any
    // pre-first-marker orphan disbursement, transaction, or adjustment).
    const [pre, ...rest] = episodes;
    const preNonEmpty =
      pre.advanceAmount !== 0 || pre.transactions.length > 0 || pre.adjustments.length > 0;
    return preNonEmpty ? episodes : rest;
  }

  if (debt.linked_account_id) {
    const accountTx = transactions.filter(
      (t) => t.account_id === debt.linked_account_id && t.status === "cleared",
    );
    const accountTransferGroups = new Set(
      accountTx.map((t) => t.transfer_group_id).filter((g): g is string => !!g),
    );
    // Any other transaction tagged to this debt, on a DIFFERENT account —
    // real pre-link history (or any other never-mirrored entry). Excludes
    // disbursements (already counted via a marker's own advanceAmount),
    // arrears-only rows (never affect principal), and the other leg of a
    // pair already represented via accountTx.
    const crossAccountTx = transactions.filter(
      (t) =>
        t.linked_debt_id === debt.id &&
        t.status === "cleared" &&
        t.account_id !== debt.linked_account_id &&
        !isDebtDisbursement(t) &&
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

    // No orphan-disbursement concept on the linked branch (matches the
    // pre-addendum code, which always pushed `advanceAmount: 0` for its
    // pretracking window here too) — any genuinely pre-first-marker content
    // is still captured, just with a $0 pretracking advance amount; the FIFO
    // walk routes it there automatically since the pretracking marker (id:
    // null) always opens first.
    const preAdvanceAmount = 0;

    const markerRefs: MarkerRef[] = markers.map((m) => ({
      id: m.adjustment.id,
      key: m.key,
      advanceAmount: Number(m.adjustment.amount),
      startDate: m.adjustment.adjustment_date.slice(0, 10),
    }));

    // accountTx entries keep the account-centric convention (positive =
    // repaid -> delta reduces remaining; negative = fee -> delta increases
    // it); crossAccountTx entries use the paying account's own convention
    // (negative = repaid; positive = fee) — the same two conventions
    // `accountCentricSplit`/`payingAccountSplit` used before the addendum.
    // Mixing them up would silently invert half the totals.
    const events: AllocEvent[] = [
      ...remainingAccountTx.map(
        (t): AllocEvent => ({
          key: txKey(t),
          id: t.id,
          delta: -Number(t.amount),
          affectsBalance: true,
          hintDate: resolveFeeMarkerHint(t.description, markers),
          transaction: t,
        }),
      ),
      ...crossAccountTx.map(
        (t): AllocEvent => ({
          key: txKey(t),
          id: t.id,
          delta: Number(t.amount),
          affectsBalance: true,
          hintDate: resolveFeeMarkerHint(t.description, markers),
          transaction: t,
        }),
      ),
      // A non-marker adjustment with no mirror on record contributes
      // directly — it's the one case (the two pre-mirroring-convention
      // "Overdraft Fee" rows found live on Dave ExtraCash) where nothing on
      // any account already represents it. A mirrored adjustment is
      // skipped: its mirror transaction is already in accountTx, counting
      // both would double it.
      ...nonMarkerAdjustments
        .filter((a) => !a.mirror_transaction_id)
        .map(
          (a): AllocEvent => ({
            key: adjKey(a),
            id: a.id,
            delta: Number(a.amount),
            affectsBalance: true,
            hintDate: resolveFeeMarkerHint(a.description, markers),
            adjustment: a,
          }),
        ),
    ];

    const linkedEpisodes = finalize(preAdvanceAmount, markerRefs, events);
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
  const disbursements = debtTx.filter((t) => isDebtDisbursement(t));
  const content = debtTx.filter((t) => !isDebtDisbursement(t) && !isArrearsOnlyPayment(t));
  const txKey = (t: Transaction) =>
    dateCreatedKey(t.cleared_date ?? t.transaction_date, t.created_at);
  const adjKey = (a: DebtAdjustment) => dateCreatedKey(a.adjustment_date, a.created_at);

  // Match each marker to its own disbursement transaction (same amount, same
  // date) rather than relying on key-order alone: useCreateAdvance inserts
  // the disbursement (Step 1) a fraction of a second BEFORE its
  // debt_adjustments row (Step 3), so the very first marker's own
  // disbursement can sort as if it predates the marker itself — found live
  // on EarnIn, where this misclassified the first $100 advance's own
  // disbursement as a "pre-tracking orphan," double-counting that $100.
  const consumedDisbursements = new Set<string>();
  for (const m of markers) {
    const match = disbursements.find(
      (t) =>
        !consumedDisbursements.has(t.id) &&
        Number(t.amount) === Number(m.adjustment.amount) &&
        t.transaction_date.slice(0, 10) === m.adjustment.adjustment_date.slice(0, 10),
    );
    if (match) consumedDisbursements.add(match.id);
  }
  const orphanDisbursements = disbursements.filter((t) => !consumedDisbursements.has(t.id));
  // Orphan disbursements dated on/after the first marker are left
  // unaccounted-for, same as before the addendum — a genuinely undocumented
  // edge case this change doesn't attempt to newly resolve.
  const preAdvanceAmount = orphanDisbursements
    .filter((t) => txKey(t) < markers[0].key)
    .reduce((s, t) => s + Number(t.amount), 0);
  const preOrphanTx = orphanDisbursements.filter((t) => txKey(t) < markers[0].key);

  const markerRefs: MarkerRef[] = markers.map((m) => ({
    id: m.adjustment.id,
    key: m.key,
    advanceAmount: Number(m.adjustment.amount),
    startDate: m.adjustment.adjustment_date.slice(0, 10),
  }));

  // A "Fee: "-prefixed transaction is ledger-only (ADR-084) — attributed for
  // DISPLAY to a specific draw (hint, else FIFO-oldest-open) but never
  // affects that draw's remaining/feesTotal/repaidTotal. Anything else:
  // negative amount -> repayment (delta = amount, reduces remaining);
  // positive amount -> fee-like increase (rare — e.g. a reversed repayment,
  // ADR-008). A non-marker debt_adjustments row contributes by its own sign
  // the same way (positive = owed increase, e.g. a fee adjustment; negative
  // = owed decrease, e.g. `insurance_covered`).
  const events: AllocEvent[] = [
    ...preOrphanTx.map(
      (t): AllocEvent => ({
        key: txKey(t),
        id: t.id,
        delta: 0,
        affectsBalance: false,
        hintDate: null,
        transaction: t,
      }),
    ),
    ...content.map((t): AllocEvent => {
      const feeTx = isFeeTransaction(t);
      return {
        key: txKey(t),
        id: t.id,
        delta: feeTx ? 0 : Number(t.amount),
        affectsBalance: !feeTx,
        hintDate: feeTx ? resolveFeeMarkerHint(t.description, markers) : null,
        transaction: t,
      };
    }),
    ...nonMarkerAdjustments
      .filter((a) => a.affects_balance !== false)
      .map(
        (a): AllocEvent => ({
          key: adjKey(a),
          id: a.id,
          delta: Number(a.amount),
          affectsBalance: true,
          hintDate: resolveFeeMarkerHint(a.description, markers),
          adjustment: a,
        }),
      ),
  ];

  return finalize(preAdvanceAmount, markerRefs, events);
}
