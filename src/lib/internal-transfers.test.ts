import { describe, expect, it } from "vitest";
import { internalTransferIds, isInternalTransfer, opaqueTransferAccountIds } from "./internal-transfers";
import { combinedActualByCategory } from "./monthly-summary";
import { buildActualResolver } from "./spending-actuals";
import type { Account, Category, Transaction } from "./supabase";

const tx = (t: Partial<Transaction>): Transaction =>
  ({
    id: Math.random().toString(36).slice(2),
    household_id: "h",
    amount: 0,
    status: "cleared",
    transaction_date: "2026-08-05",
    ...t,
  }) as Transaction;

const savings: Category = {
  id: "cat-savings",
  household_id: "h",
  name: "Travel",
  domain: "spending",
} as Category;

describe("internalTransferIds", () => {
  it("flags a group only when both legs exist", () => {
    const rows = [
      tx({ amount: -100, transfer_group_id: "g1" }),
      tx({ amount: 100, transfer_group_id: "g1" }),
      tx({ amount: -50, transfer_group_id: "g2" }), // one-sided
      tx({ amount: -25 }),
    ];
    const internal = internalTransferIds(rows);
    expect([...internal]).toEqual(["g1"]);
    expect(isInternalTransfer(rows[0], internal)).toBe(true);
    expect(isInternalTransfer(rows[2], internal)).toBe(false);
    expect(isInternalTransfer(rows[3], internal)).toBe(false);
  });
});

describe("ADR-097 transfer fee row", () => {
  it("is not counted as an internal transfer leg (paired via split_group_id, not transfer_group_id)", () => {
    const rows = [
      tx({ amount: -100, transfer_group_id: "g1" }), // from-leg
      tx({ amount: 100, transfer_group_id: "g1" }), // to-leg
      tx({ amount: -3, split_group_id: "g1", category_id: savings.id, description: "Fee: Transfer" }),
    ];
    const internal = internalTransferIds(rows);
    expect([...internal]).toEqual(["g1"]);
    expect(isInternalTransfer(rows[2], internal)).toBe(false);
  });

  it("counts as real spend in combinedActualByCategory alongside its excluded transfer pair", () => {
    const rows = [
      tx({ amount: -100, category_id: savings.id, transfer_group_id: "g1" }),
      tx({ amount: 100, category_id: savings.id, transfer_group_id: "g1" }),
      tx({ amount: -3, category_id: savings.id, split_group_id: "g1", description: "Fee: Transfer" }),
    ];
    const out = combinedActualByCategory(rows, [], [], [savings], "2026-08-01");
    expect(out.get(savings.id)?.spendingSpent).toBe(3);
  });
});

describe("ADR-103 Cash Back combo", () => {
  // Fred's: an $8.50 snack plus $100 cash back in one swipe. Generalizes the
  // ADR-097 fee-row test above from one fixed-category amount to N
  // categorized purchase lines sharing the transfer's own group id.
  it("the purchase line counts as spend once; the cash-back transfer legs never count", () => {
    const rows = [
      tx({ amount: -100, account_id: "checking", transfer_group_id: "g1" }),
      tx({ amount: 100, account_id: "cash", transfer_group_id: "g1" }),
      tx({ amount: -8.5, category_id: savings.id, account_id: "checking", split_group_id: "g1" }),
    ];
    const internal = internalTransferIds(rows);
    expect(isInternalTransfer(rows[2], internal)).toBe(false);
    const out = combinedActualByCategory(rows, [], [], [savings], "2026-08-01");
    expect(out.get(savings.id)?.spendingSpent).toBe(8.5);
  });

  it("later spending the withdrawn cash counts once more, never the original $100 twice", () => {
    const rows = [
      tx({ amount: -100, account_id: "checking", transfer_group_id: "g1" }),
      tx({ amount: 100, account_id: "cash", transfer_group_id: "g1" }),
      tx({ amount: -8.5, category_id: savings.id, account_id: "checking", split_group_id: "g1" }),
      // Days later: $50 of that cash spent at the movies, logged as a plain
      // transaction on the Cash account.
      tx({ amount: -50, category_id: savings.id, account_id: "cash", transaction_date: "2026-08-10" }),
    ];
    const out = combinedActualByCategory(rows, [], [], [savings], "2026-08-01");
    // 8.50 purchase + 50 spent from cash = 58.50 — never 108.50 or 158.50.
    expect(out.get(savings.id)?.spendingSpent).toBe(58.5);
  });
});

describe("ADR-089 addendum: transfers into an opaque (untracked) account count as spend", () => {
  const stephChecking = "steph-checking";
  const stevenChecking = "steven-checking";
  const opaque = new Set([stephChecking]);

  it("a transfer landing on an opaque account is no longer internal", () => {
    const rows = [
      tx({ amount: -25, account_id: stevenChecking, transfer_group_id: "g1" }),
      tx({ amount: 25, account_id: stephChecking, transfer_group_id: "g1" }),
    ];
    const internal = internalTransferIds(rows, opaque);
    expect([...internal]).toEqual([]);
    expect(isInternalTransfer(rows[0], internal)).toBe(false);
  });

  it("its negative leg counts as real spend once passed through combinedActualByCategory", () => {
    const rows = [
      tx({ amount: -25, category_id: savings.id, account_id: stevenChecking, transfer_group_id: "g1" }),
      tx({ amount: 25, category_id: savings.id, account_id: stephChecking, transfer_group_id: "g1" }),
    ];
    const out = combinedActualByCategory(rows, [], [], [savings], "2026-08-01", opaque);
    expect(out.get(savings.id)?.spendingSpent).toBe(25);
  });

  it("the reverse direction (money coming FROM the opaque account) stays a neutral internal transfer", () => {
    const rows = [
      tx({ amount: -10, account_id: stephChecking, transfer_group_id: "g2" }),
      tx({ amount: 10, account_id: stevenChecking, transfer_group_id: "g2" }),
    ];
    const internal = internalTransferIds(rows, opaque);
    expect([...internal]).toEqual(["g2"]);
    expect(isInternalTransfer(rows[0], internal)).toBe(true);
  });

  it("a normal transfer between two non-opaque accounts is unaffected", () => {
    const rows = [
      tx({ amount: -25, account_id: stevenChecking, transfer_group_id: "g3" }),
      tx({ amount: 25, account_id: "steven-savings", transfer_group_id: "g3" }),
    ];
    const internal = internalTransferIds(rows, opaque);
    expect([...internal]).toEqual(["g3"]);
  });

  it("opaqueTransferAccountIds() picks out only accounts flagged transfers_count_as_spend", () => {
    const accounts = [
      { id: "a1", transfers_count_as_spend: true },
      { id: "a2", transfers_count_as_spend: false },
      { id: "a3" },
    ] as Account[];
    expect([...opaqueTransferAccountIds(accounts)]).toEqual(["a1"]);
  });
});

describe("ADR-089 transfers in spending math", () => {
  const rows = [
    tx({ amount: -300, category_id: savings.id, transfer_group_id: "g1" }),
    tx({ amount: 300, category_id: savings.id, transfer_group_id: "g1" }),
    tx({ amount: -50, category_id: savings.id, transfer_group_id: "g2" }),
    tx({ amount: -10, category_id: savings.id }),
  ];

  it("excludes two-sided transfers from combinedActualByCategory", () => {
    const out = combinedActualByCategory(rows, [], [], [savings], "2026-08-01");
    expect(out.get(savings.id)?.spendingSpent).toBe(60);
  });

  it("excludes two-sided transfers from the spending actual resolver", () => {
    const resolver = buildActualResolver([], rows, [], [savings]);
    expect(resolver.resolve(savings.id, "2026-08-01").amount).toBe(60);
  });
});
