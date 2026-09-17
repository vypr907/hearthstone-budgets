import type { Account, AccountBalance, Bill, Debt, Institution, Transaction } from "./supabase";
import { debtDueDate } from "./format";
import { todayISO } from "./snapshot";
import { billCycleDue, billRemainingOwed } from "./payments";

export type AccountBalanceInfo = {
  anchor: number;
  current: number;
  spendable: number;
  asOf: string | null;
};

/**
 * Anchor = latest account_balances snapshot, else starting_balance.
 * Current  = anchor + cleared transactions dated after the anchor.
 * Spendable = anchor + cleared AND pending transactions after the anchor.
 *
 * ADR-100: a cleared transaction is compared by when it actually cleared
 * (`cleared_date`), not when it was logged — matches what a bank statement
 * would show as of the anchor's `as_of_date`. Falls back to `transaction_date`
 * for any row that predates this feature (should be rare/never post-backfill).
 * A pending transaction has no cleared_date by definition, so it stays on
 * `transaction_date` — its only meaningful date.
 */
export function computeBalances(
  accounts: Account[],
  latest: Record<string, AccountBalance | undefined>,
  transactions: Transaction[],
): Record<string, AccountBalanceInfo> {
  const out: Record<string, AccountBalanceInfo> = {};
  for (const a of accounts) {
    const snap = latest[a.id];
    const anchor = snap ? Number(snap.balance) : Number(a.starting_balance ?? 0);
    const since = snap ? snap.as_of_date.slice(0, 10) : null;
    let cleared = 0;
    let pending = 0;
    for (const t of transactions) {
      if (t.account_id !== a.id) continue;
      if (t.status === "cleared") {
        const d = (t.cleared_date ?? t.transaction_date).slice(0, 10);
        if (since && d <= since) continue;
        cleared += Number(t.amount || 0);
      } else if (t.status === "pending") {
        if (since && t.transaction_date.slice(0, 10) <= since) continue;
        pending += Number(t.amount || 0);
      }
    }
    out[a.id] = {
      anchor,
      current: anchor + cleared,
      spendable: anchor + cleared + pending,
      asOf: since,
    };
  }
  return out;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Account types that may count toward the combined spendable total. */
export const SPENDABLE_TYPES = ["checking", "credit", "cash"];
/** Never counted as spendable, regardless of is_spendable. */
export const EXCLUDED_TYPES = ["savings", "invest", "retirement", "hsa", "lpfsa"];

/**
 * ADR-088: does this account count toward `viewerMemberId`'s spendable /
 * net-worth aggregates? A null `owner_member_id` is shared (counts for
 * everyone); a set owner counts only for that member. An unknown viewer
 * (id null/undefined, e.g. members still loading) sees everything — the
 * aggregate is never silently understated.
 * Visibility and edit rights are unaffected; this only scopes totals.
 */
export function accountInMemberView(
  a: Pick<Account, "owner_member_id">,
  viewerMemberId: string | null | undefined,
): boolean {
  if (!a.owner_member_id) return true;
  if (!viewerMemberId) return true;
  return a.owner_member_id === viewerMemberId;
}

export function isSpendableAccount(a: Account): boolean {
  const t = norm(a.account_type);
  if (EXCLUDED_TYPES.includes(t)) return false;
  if (!SPENDABLE_TYPES.includes(t)) return false;
  return a.is_spendable === true;
}

export function accountTypeIs(a: Account, type: string): boolean {
  return norm(a.account_type) === type;
}

/** Amount owed on a credit account (balances may be stored signed either way). */
export function creditOwed(balance: number): number {
  return Math.abs(balance);
}

/**
 * A debt's remaining balance, derived from its linked account when it has
 * one (`debts.linked_account_id`, ADR-102) — never independently written for
 * a linked debt. Same "derived, never stored" shape this app already uses
 * for savings-goal balances (ADR-027) and ledger cycle state (ADR-036/085),
 * rather than trying to keep a stored column in sync via write-time hooks
 * scattered across every account-mutating code path.
 *
 * Falls back to the debt's own stored `remaining_balance` when unlinked, or
 * when the linked account can't be resolved (e.g. deleted) — every unlinked
 * debt (the vast majority) is byte-for-byte unaffected by this function
 * existing at all.
 */
export function effectiveDebtBalance(
  debt: Pick<Debt, "linked_account_id" | "remaining_balance">,
  accounts: Account[],
  latest: Record<string, AccountBalance | undefined>,
  transactions: Transaction[],
): number {
  if (debt.linked_account_id) {
    const account = accounts.find((a) => a.id === debt.linked_account_id);
    if (account) {
      const balances = computeBalances([account], latest, transactions);
      return creditOwed(balances[account.id].current);
    }
  }
  return Number(debt.remaining_balance ?? 0);
}

/**
 * Whether a debt is paid off, given its already-resolved balance (the
 * caller's own effective/derived value — this function doesn't derive one
 * itself, since call sites differ in what "balance" already means for
 * them). ADR-056 addendum: an advance routinely sits at $0 between draws
 * and is not "paid off" until the payment flow actually stamps
 * `date_paid_off` (ADR-066 then reactivates it on the next draw); every
 * other debt type is paid off once its balance hits zero.
 *
 * Single source of truth deliberately — this codebase already shipped a
 * bug ("Aurora Audiology") from two independently-drifted paid-off
 * definitions (`isPaidOff` vs. a raw `date_paid_off` check) disagreeing.
 */
export function isDebtPaidOff(
  debt: Pick<Debt, "debt_type" | "date_paid_off">,
  balance: number,
): boolean {
  return debt.debt_type === "advance" ? !!debt.date_paid_off : balance <= 0;
}

/**
 * ADR-023: what one account contributes to the COMBINED household spendable
 * total. Checking contributes its raw spendable balance; credit contributes
 * available credit (limit - owed). Returns null when the account should be
 * excluded from the total — credit accounts with no credit_limit entered.
 */
export function spendableContribution(
  account: Account,
  spendable: number,
): number | null {
  if (!isSpendableAccount(account)) return null;
  if (accountTypeIs(account, "credit")) {
    const limit = Number(account.credit_limit ?? 0);
    if (!limit) return null;
    return limit - creditOwed(spendable);
  }
  return spendable;
}

/** Credit accounts included in the total but missing a usable credit_limit. */
export function creditAccountsMissingLimit(accounts: Account[]): Account[] {
  return accounts.filter(
    (a) =>
      isSpendableAccount(a) &&
      accountTypeIs(a, "credit") &&
      !Number(a.credit_limit ?? 0),
  );
}

/**
 * Per-account "Current"/"Spendable" figures for display. Every account
 * type except credit shows the raw signed `computeBalances` values
 * unchanged. For a credit account: "Current" drops the sign (it's always
 * "what you owe", same as a real card statement's Balance); "Spendable"
 * becomes available credit (credit_limit - owed) — which *can* go
 * negative when the account is over its limit — or `null` when the
 * account has no `credit_limit` set at all (nothing to compute against).
 */
export function accountDisplayBalances(
  account: Pick<Account, "account_type" | "credit_limit">,
  balance: Pick<AccountBalanceInfo, "current" | "spendable"> | undefined,
): { current: number; spendable: number | null } {
  const current = balance?.current ?? 0;
  const spendable = balance?.spendable ?? 0;
  if (norm(account.account_type) !== "credit") return { current, spendable };
  const limit = Number(account.credit_limit ?? 0);
  return {
    current: creditOwed(current),
    spendable: limit ? limit - creditOwed(spendable) : null,
  };
}

/**
 * ADR-027: a savings goal's current amount, derived exactly like account
 * balances — the sum of CLEARED transactions linked to that goal. Never stored.
 */
export function computeGoalBalances(
  goalIds: string[],
  transactions: Transaction[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of goalIds) out[id] = 0;
  for (const t of transactions) {
    const gid = t.linked_goal_id;
    if (!gid || !(gid in out)) continue;
    if (t.status !== "cleared") continue;
    out[gid] += Number(t.amount || 0);
  }
  return out;
}

/** Months (>= 1) between today and a target date; null when no date is set. */
export function monthsRemaining(targetDate: string | null | undefined): number | null {
  if (!targetDate) return null;
  const now = new Date();
  const t = new Date(`${targetDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(t.getTime())) return null;
  const months =
    (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth());
  return Math.max(1, months);
}

/** Whole days left until a target date; null when no date is set. */
export function daysRemaining(targetDate: string | null | undefined): number | null {
  if (!targetDate) return null;
  const t = new Date(`${targetDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(t.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

/**
 * ADR-031: institution-level computed totals. Never stored — derived on render.
 *
 * - Accounts linked → Current Balance = sum of those accounts' current balance;
 *   no Current Due.
 * - No accounts, but bills/debts linked → Current Balance = open debt balances
 *   + open-cycle bill amounts; Current Due = still-owed bill amounts this cycle
 *   + minimum payments for debts due on/before today.
 * - Nothing linked → both null.
 *
 * ADR-106: a parent institution's totals (Amazon) also fold in every child's
 * (Prime/Kindle/Audible, `parent_institution_id === institutionId`) own
 * accounts/bills/debts — the underlying rows stay on their real institution,
 * this just widens which ones count toward the parent's number.
 */
export type InstitutionTotals = {
  source: "accounts" | "obligations" | "none";
  currentBalance: number | null;
  currentDue: number | null;
};

export function computeInstitutionTotals(
  institutionId: string,
  accounts: Account[],
  balances: Record<string, AccountBalanceInfo>,
  bills: Bill[],
  debts: Debt[],
  institutions: Institution[] = [],
): InstitutionTotals {
  const childIds = institutions
    .filter((i) => i.parent_institution_id === institutionId)
    .map((i) => i.id);
  const candidateIds = new Set([institutionId, ...childIds]);

  const linkedAccounts = accounts.filter(
    (a) => !!a.institution_id && candidateIds.has(a.institution_id),
  );
  if (linkedAccounts.length > 0) {
    const total = linkedAccounts.reduce(
      (sum, a) => sum + (balances[a.id]?.current ?? Number(a.starting_balance ?? 0)),
      0,
    );
    return { source: "accounts", currentBalance: total, currentDue: null };
  }

  const linkedBills = bills.filter(
    (b) => !!b.institution_id && candidateIds.has(b.institution_id) && b.is_active !== false,
  );
  const linkedDebts = debts.filter(
    (d) => !!d.institution_id && candidateIds.has(d.institution_id) && !d.date_paid_off,
  );
  if (linkedBills.length === 0 && linkedDebts.length === 0)
    return { source: "none", currentBalance: null, currentDue: null };

  const today = todayISO();
  let balance = 0;
  let due = 0;

  for (const b of linkedBills) {
    const owed = billRemainingOwed(b);
    if (owed <= 0) continue;
    balance += billCycleDue(b);
    due += owed;
  }

  for (const d of linkedDebts) {
    const remaining = Number(d.remaining_balance ?? 0);
    if (remaining > 0) balance += remaining;
    const dueDate = debtDueDate(d);
    if (dueDate && dueDate <= today) due += Number(d.minimum_payment ?? 0);
  }

  return { source: "obligations", currentBalance: balance, currentDue: due };
}
