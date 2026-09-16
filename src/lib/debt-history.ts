import type { Account, AccountBalance, Debt, DebtAdjustment, Transaction } from "./supabase";
import { isAdvanceDisbursement, isFeeTransaction } from "./payments";
import { balanceAsOf } from "./net-worth";
import { creditOwed } from "./balances";

export type DebtHistoryPoint = {
  /** ISO date the point is measured at (month end / today). */
  date: string;
  label: string;
  total: number;
};

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * A debt's remaining balance as of `date`, reconstructed from first
 * principles — debts have no periodic snapshot table the way accounts have
 * `account_balances`, so this walks the full history instead. Mirrors
 * `net-worth.ts`'s `balanceAsOf`, but anchored on `debt.starting_balance`
 * (the ledger's day-one figure) rather than `program_start_balance` (a
 * separate, sometimes-divergent payoff-strategy baseline the user edits by
 * hand — not a ledger fact, so not a safe anchor here).
 *
 * Two source of truth, added on top of the anchor:
 *  - `debt_adjustments` rows (advances/fees/manual corrections) dated on or
 *    before `date` — `amount` adds directly, exactly as the atomic
 *    `apply_debt_advance`/`apply_debt_adjustment` RPCs apply it
 *    (2026-09-11-atomic-debt-balance-rpcs.sql). A row with
 *    `affects_balance === false` is record-only and skipped.
 *  - Cleared ledger transactions linked to the debt (`linked_debt_id`),
 *    dated on or before `date` (compared by `cleared_date ?? transaction_date`,
 *    ADR-100 — matches `balanceAsOf`'s own convention) — a payment's already-
 *    negative `amount` subtracts. An advance's *disbursement* leg
 *    (`isAdvanceDisbursement`) is excluded: `debt_adjustments` already
 *    counts that advance, so adding the linked deposit row too would double
 *    it. A "Fee: …" row (`isFeeTransaction`) is excluded for the same reason
 *    `deriveCycleInfo` excludes it — normally written unlinked anyway, this
 *    guard only matters if one is ever linked by mistake.
 *
 * Verified against this household's real data (2026-09-15, via the
 * read-only Supabase MCP): reconstructing Dave ExtraCash and EarnIn through
 * every recorded event lands exactly on their live `remaining_balance`
 * ($45.00 and $150.00 respectively) — see `debt-history.test.ts`.
 *
 * ADR-102 addendum: for a debt with `linked_account_id` set, none of the
 * above applies — a linked debt's balance is derived from its account
 * (effectiveDebtBalance, balances.ts), and purchases (its primary driver)
 * never touch `debt_adjustments` or carry `linked_debt_id` at all. Delegates
 * entirely to `net-worth.ts`'s `balanceAsOf` for every date, including
 * before the link existed — accepted tradeoff: the trend for months before
 * the account had real transaction history will read flat/inaccurate for a
 * linked debt (Year in Review is a secondary reporting view; the live
 * balance shown everywhere else always uses `effectiveDebtBalance`, not
 * this function).
 */
export function debtBalanceAsOf(
  debt: Pick<Debt, "id" | "starting_balance" | "linked_account_id">,
  adjustments: DebtAdjustment[],
  transactions: Transaction[],
  date: string,
  accounts: Account[] = [],
  accountBalances: AccountBalance[] = [],
): number {
  if (debt.linked_account_id) {
    const account = accounts.find((a) => a.id === debt.linked_account_id);
    if (account) {
      return creditOwed(balanceAsOf(account, accountBalances, transactions, date));
    }
  }
  const day = date.slice(0, 10);
  let balance = Number(debt.starting_balance ?? 0);

  for (const a of adjustments) {
    if (a.debt_id !== debt.id) continue;
    if (a.affects_balance === false) continue;
    if (a.adjustment_date.slice(0, 10) > day) continue;
    balance += Number(a.amount || 0);
  }

  for (const t of transactions) {
    if (t.linked_debt_id !== debt.id) continue;
    if (t.status !== "cleared") continue;
    if (isAdvanceDisbursement(t)) continue;
    if (isFeeTransaction(t)) continue;
    const d = (t.cleared_date ?? t.transaction_date).slice(0, 10);
    if (d > day) continue;
    balance += Number(t.amount || 0);
  }

  return Math.max(0, balance);
}

/**
 * Month-end total-debt-owed points across `year` (Jan through Dec, or
 * through today for the current year — never projecting into the future).
 * `debts` should be every debt the household has ever had, not just
 * currently-active ones, so a debt paid off mid-year still contributes its
 * true balance to the earlier points instead of vanishing from the total.
 */
export function debtPayoffTrend(
  debts: Pick<Debt, "id" | "starting_balance" | "linked_account_id">[],
  adjustments: DebtAdjustment[],
  transactions: Transaction[],
  year: number,
  today: Date = new Date(),
  accounts: Account[] = [],
  accountBalances: AccountBalance[] = [],
): DebtHistoryPoint[] {
  const isCurrentYear = year === today.getFullYear();
  const lastMonthIndex = isCurrentYear ? today.getMonth() : 11; // 0-indexed
  const points: DebtHistoryPoint[] = [];
  for (let m = 0; m <= lastMonthIndex; m++) {
    const isLast = m === lastMonthIndex;
    const end = isLast && isCurrentYear ? today : new Date(year, m + 1, 0);
    const date = iso(end);
    let total = 0;
    for (const d of debts) {
      total += debtBalanceAsOf(d, adjustments, transactions, date, accounts, accountBalances);
    }
    points.push({ date, label: end.toLocaleDateString("en-US", { month: "short" }), total });
  }
  return points;
}

/**
 * Total paid down across `year`: sum of each debt's balance at the end of
 * the prior year minus its balance at the end of (or today, if current)
 * this year. A debt that didn't exist yet at the prior year-end reads $0
 * there (its anchor plus zero adjustments/transactions before that date),
 * so it never contributes a spurious negative "paid down" — only debts that
 * grew net-net over the year are excluded from the total (floored per-debt
 * at 0, not just in aggregate, so one debt growing can't mask another's
 * real payoff progress).
 */
export function totalPaidDownInYear(
  debts: Pick<Debt, "id" | "starting_balance" | "linked_account_id">[],
  adjustments: DebtAdjustment[],
  transactions: Transaction[],
  year: number,
  today: Date = new Date(),
  accounts: Account[] = [],
  accountBalances: AccountBalance[] = [],
): number {
  const priorYearEnd = `${year - 1}-12-31`;
  const yearEndDate = year === today.getFullYear() ? today : new Date(year, 11, 31);
  const yearEnd = iso(yearEndDate);
  let paidDown = 0;
  for (const d of debts) {
    const start = debtBalanceAsOf(d, adjustments, transactions, priorYearEnd, accounts, accountBalances);
    const end = debtBalanceAsOf(d, adjustments, transactions, yearEnd, accounts, accountBalances);
    paidDown += Math.max(0, start - end);
  }
  return paidDown;
}
