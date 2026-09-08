import { describe, expect, it } from "vitest";
import { internalTransferIds, isInternalTransfer } from "./internal-transfers";
import { combinedActualByCategory } from "./monthly-summary";
import { buildActualResolver } from "./spending-actuals";
import type { Category, Transaction } from "./supabase";

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
