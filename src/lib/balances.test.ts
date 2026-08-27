import { describe, expect, it } from "vitest";
import { accountInMemberView } from "./balances";
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
