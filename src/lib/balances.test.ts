import { describe, expect, it } from "vitest";
import {
  accountDisplayBalances,
  accountInMemberView,
  isSpendableAccount,
  spendableContribution,
} from "./balances";
import { netWorthTrend } from "./net-worth";
import type { Account, AccountBalance, Transaction } from "./supabase";

/* ------------------------------------------------------------------ */
/* ADR-088: accountInMemberView                                        */
/* ------------------------------------------------------------------ */

describe("accountInMemberView (ADR-088)", () => {
  const joint = { owner_member_id: null };
  const mine = { owner_member_id: "m1" };
  const hers = { owner_member_id: "m2" };

  it("a joint account counts for every viewer", () => {
    expect(accountInMemberView(joint, "m1")).toBe(true);
    expect(accountInMemberView(joint, "m2")).toBe(true);
    expect(accountInMemberView(joint, undefined)).toBe(true);
  });

  it("a personal account counts only for its owner", () => {
    expect(accountInMemberView(mine, "m1")).toBe(true);
    expect(accountInMemberView(mine, "m2")).toBe(false);
    expect(accountInMemberView(hers, "m1")).toBe(false);
  });

  it("an unknown viewer sees everything (aggregate is never understated)", () => {
    expect(accountInMemberView(mine, undefined)).toBe(true);
    expect(accountInMemberView(mine, null)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* ADR-103: a "cash" account counts as spendable                       */
/* ------------------------------------------------------------------ */

describe("isSpendableAccount / spendableContribution (ADR-103 cash accounts)", () => {
  const cash = (over: Partial<Account>): Account =>
    ({
      id: "cash-1",
      household_id: "h",
      institution_id: null,
      name: "Cash",
      account_type: "cash",
      starting_balance: 0,
      is_spendable: true,
      credit_limit: null,
      notes: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      ...over,
    }) as Account;

  it("a cash account with is_spendable=true counts as spendable", () => {
    expect(isSpendableAccount(cash({}))).toBe(true);
  });

  it("a cash account with is_spendable=false does not", () => {
    expect(isSpendableAccount(cash({ is_spendable: false }))).toBe(false);
  });

  it("contributes its raw balance, same as checking (no credit-limit math)", () => {
    expect(spendableContribution(cash({}), 42.5)).toBe(42.5);
  });
});

/* ------------------------------------------------------------------ */
/* ADR-088: netWorthTrend honours include_in_net_worth                 */
/* ------------------------------------------------------------------ */

const acct = (over: Partial<Account>): Account =>
  ({
    id: "a1",
    household_id: "h",
    institution_id: null,
    name: "Acct",
    account_type: "checking",
    starting_balance: 0,
    is_spendable: true,
    credit_limit: null,
    notes: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...over,
  }) as Account;

describe("netWorthTrend (ADR-088 include_in_net_worth)", () => {
  const balances: AccountBalance[] = [];
  const txns: Transaction[] = [];
  const today = new Date("2026-06-15T00:00:00");

  it("skips accounts flagged include_in_net_worth === false", () => {
    const accounts = [
      acct({ id: "a1", starting_balance: 100 }),
      acct({ id: "a2", starting_balance: 500, include_in_net_worth: false }),
    ];
    const points = netWorthTrend(accounts, balances, txns, 1, today);
    expect(points).toHaveLength(1);
    expect(points[0].total).toBe(100);
  });

  it("null / true / undefined all count", () => {
    const accounts = [
      acct({ id: "a1", starting_balance: 10, include_in_net_worth: true }),
      acct({ id: "a2", starting_balance: 20, include_in_net_worth: null }),
      acct({ id: "a3", starting_balance: 30 }),
    ];
    const points = netWorthTrend(accounts, balances, txns, 1, today);
    expect(points[0].total).toBe(60);
  });
});

/* ------------------------------------------------------------------ */
/* accountDisplayBalances: credit accounts show owed (no sign) and     */
/* available credit, everything else passes through unchanged          */
/* ------------------------------------------------------------------ */

describe("accountDisplayBalances", () => {
  const credit = (over: Partial<Account>): Account =>
    acct({ account_type: "credit", credit_limit: 1600, ...over });

  it("credit account: Current drops the sign, Spendable is limit - owed", () => {
    // -1568.77 owed, -1583.76 including a pending charge (matches the
    // Mission Lane example: $1,600 limit, $16.24 available).
    const out = accountDisplayBalances(credit({}), { current: -1568.77, spendable: -1583.76 });
    expect(out.current).toBe(1568.77);
    expect(out.spendable).toBeCloseTo(16.24, 2);
  });

  it("credit account over its limit: Spendable goes negative", () => {
    const out = accountDisplayBalances(credit({ credit_limit: 300 }), {
      current: -320,
      spendable: -320,
    });
    expect(out.current).toBe(320);
    expect(out.spendable).toBe(-20);
  });

  it("credit account with no credit_limit set: Spendable is null (can't compute)", () => {
    const out = accountDisplayBalances(credit({ credit_limit: null }), {
      current: -100,
      spendable: -100,
    });
    expect(out.current).toBe(100);
    expect(out.spendable).toBeNull();
  });

  it("non-credit account: both values pass through unchanged, sign and all", () => {
    const checking = acct({ account_type: "checking" });
    const out = accountDisplayBalances(checking, { current: -42.5, spendable: 100 });
    expect(out.current).toBe(-42.5);
    expect(out.spendable).toBe(100);
  });

  it("missing balance defaults to 0 for both fields", () => {
    expect(accountDisplayBalances(acct({ account_type: "checking" }), undefined)).toEqual({
      current: 0,
      spendable: 0,
    });
  });
});
