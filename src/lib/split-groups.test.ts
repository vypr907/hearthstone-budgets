import { describe, expect, it } from "vitest";
import {
  classifyLedgerGroup,
  isCategorySplitGroup,
  assertCategorySplitRows,
  groupLedgerRows,
} from "./split-groups";
import type { Transaction } from "./supabase";

const row = (over: Partial<Transaction>): Transaction =>
  ({
    id: crypto.randomUUID(),
    household_id: "h",
    account_id: "acct-1",
    amount: 100,
    status: "cleared",
    category_id: null,
    linked_bill_id: null,
    linked_debt_id: null,
    linked_goal_id: null,
    description: null,
    transaction_date: "2026-08-27",
    split_group_id: "grp",
    transfer_group_id: null,
    institution_id: null,
    created_at: "2026-08-27",
    updated_at: "2026-08-27",
    ...over,
  }) as Transaction;

const EVENTS = new Set(["evt-1"]);

describe("classifyLedgerGroup (ADR-047 addendum)", () => {
  it("group id that is an income_events.id → paycheck, even across accounts", () => {
    const rows = [row({ account_id: "a" }), row({ account_id: "b" })];
    expect(classifyLedgerGroup(rows, "evt-1", EVENTS)).toBe("paycheck");
  });

  it("group id that is an income_events.id → paycheck, even single-account", () => {
    const rows = [row({ account_id: "a" }), row({ account_id: "a" })];
    expect(classifyLedgerGroup(rows, "evt-1", EVENTS)).toBe("paycheck");
  });

  it("non-event id spanning >1 account → linked-or-multi", () => {
    const rows = [row({ account_id: "a" }), row({ account_id: "b" })];
    expect(classifyLedgerGroup(rows, "grp", EVENTS)).toBe("linked-or-multi");
  });

  // ADR-091: one linked row + fee lines on one account is the payment+fee
  // shape and gets the grouped editor; >1 linked row stays per-row.
  it("non-event id with exactly one bill/debt-linked row → payment-with-fees", () => {
    expect(
      classifyLedgerGroup([row({}), row({ linked_bill_id: "b1" })], "grp", EVENTS),
    ).toBe("payment-with-fees");
    expect(
      classifyLedgerGroup([row({}), row({ linked_debt_id: "d1" })], "grp", EVENTS),
    ).toBe("payment-with-fees");
  });

  it("non-event id with two linked rows → linked-or-multi", () => {
    expect(
      classifyLedgerGroup(
        [row({ linked_debt_id: "d1" }), row({ linked_bill_id: "b1" })],
        "grp",
        EVENTS,
      ),
    ).toBe("linked-or-multi");
  });

  it("linked row across two accounts → linked-or-multi", () => {
    expect(
      classifyLedgerGroup(
        [row({ account_id: "a" }), row({ account_id: "b", linked_bill_id: "b1" })],
        "grp",
        EVENTS,
      ),
    ).toBe("linked-or-multi");
  });


  it("one account, no links, non-event id → category-split", () => {
    const rows = [
      row({ account_id: "a", category_id: "c1" }),
      row({ account_id: "a", category_id: "c2" }),
    ];
    expect(classifyLedgerGroup(rows, "grp", EVENTS)).toBe("category-split");
  });

  it("category split with a null-category line still counts as category-split", () => {
    const rows = [
      row({ account_id: "a", category_id: "c1" }),
      row({ account_id: "a", category_id: null }),
    ];
    expect(classifyLedgerGroup(rows, "grp", EVENTS)).toBe("category-split");
    expect(isCategorySplitGroup(rows, "grp", EVENTS)).toBe(true);
  });

  it("empty rows (still loading) → category-split (caller falls through to single-row view)", () => {
    expect(classifyLedgerGroup([], "grp", EVENTS)).toBe("category-split");
  });
});

describe("assertCategorySplitRows", () => {
  it("throws on a multi-account group", () => {
    expect(() =>
      assertCategorySplitRows([{ account_id: "a" }, { account_id: "b" }] as never),
    ).toThrow(/multiple accounts/i);
  });

  it("throws on a linked row", () => {
    expect(() =>
      assertCategorySplitRows([
        { account_id: "a" },
        { account_id: "a", linked_debt_id: "d1" },
      ] as never),
    ).toThrow(/bill or debt/i);
  });

  it("passes a genuine single-account category split", () => {
    expect(() =>
      assertCategorySplitRows([
        { account_id: "a", category_id: "c1" },
        { account_id: "a", category_id: null },
      ] as never),
    ).not.toThrow();
  });
});

describe("groupLedgerRows still collapses a paycheck group", () => {
  it("multi-account rows sharing split_group_id → one isSplit entry", () => {
    const rows = [
      row({ account_id: "a", split_group_id: "evt-1", amount: 1810 }),
      row({ account_id: "b", split_group_id: "evt-1", amount: 1300 }),
      row({ account_id: "c", split_group_id: "evt-1", amount: 50 }),
    ];
    const entries = groupLedgerRows(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].isSplit).toBe(true);
    expect(entries[0].rows).toHaveLength(3);
    expect(entries[0].total).toBe(3160);
  });
});
