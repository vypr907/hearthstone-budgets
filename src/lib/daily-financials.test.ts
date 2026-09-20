import { describe, expect, it } from "vitest";
import {
  billsDebtsPaidOnDay,
  dailySpendByCategory,
  dailySpendSeries,
  dayMoneyInOut,
} from "./daily-financials";
import type { Bill, Category, Debt, Institution, Transaction } from "./supabase";

const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: over.id ?? "t",
    household_id: "h",
    account_id: "a1",
    category_id: null,
    amount: 0,
    status: "cleared",
    description: null,
    transaction_date: "2026-09-20",
    linked_bill_id: null,
    linked_debt_id: null,
    ...over,
  }) as Transaction;

const spending: Category = {
  id: "cat-groceries",
  household_id: "h",
  name: "Groceries",
  domain: "spending",
} as Category;

const income: Category = {
  id: "cat-income",
  household_id: "h",
  name: "Income",
  domain: "income",
} as Category;

const institution: Institution = {
  id: "inst-1",
  household_id: "h",
  name: "Trader Joe's",
} as Institution;

/* ------------------------------------------------------------------ */
/* ADR-108: dayMoneyInOut                                              */
/* ------------------------------------------------------------------ */

describe("dayMoneyInOut", () => {
  it("sums in/out only for the given day, ignoring internal transfer legs", () => {
    const transactions = [
      tx({ id: "1", amount: -50, transaction_date: "2026-09-20" }),
      tx({ id: "2", amount: 1000, transaction_date: "2026-09-20" }),
      tx({ id: "3", amount: -20, transaction_date: "2026-09-21" }), // other day
      tx({
        id: "4",
        amount: -100,
        transfer_group_id: "g1",
        transaction_date: "2026-09-20",
      }),
    ];
    const result = dayMoneyInOut(transactions, new Set(["g1"]), "2026-09-20");
    expect(result).toEqual({ in: 1000, out: 50, net: 950 });
  });
});

/* ------------------------------------------------------------------ */
/* ADR-108: dailySpendByCategory (spending-only)                       */
/* ------------------------------------------------------------------ */

describe("dailySpendByCategory", () => {
  const categories = [spending, income];
  const institutions = [institution];

  it("groups spending-only transactions by category then institution", () => {
    const transactions = [
      tx({ id: "1", amount: -30, category_id: spending.id, institution_id: institution.id }),
      tx({ id: "2", amount: -10, category_id: spending.id, institution_id: null }),
    ];
    const rows = dailySpendByCategory(
      transactions,
      categories,
      institutions,
      new Set(),
      "2026-09-20",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(40);
    expect(rows[0].byInstitution).toEqual(
      expect.arrayContaining([
        { institutionId: institution.id, institution, amount: 30 },
        { institutionId: null, institution: null, amount: 10 },
      ]),
    );
  });

  it("excludes bill/debt-linked transactions (ADR-108 spending-only decision)", () => {
    const transactions = [
      tx({ id: "1", amount: -75, category_id: spending.id, linked_bill_id: "bill-1" }),
    ];
    const rows = dailySpendByCategory(
      transactions,
      categories,
      institutions,
      new Set(),
      "2026-09-20",
    );
    expect(rows).toHaveLength(0);
  });

  it("excludes income-domain categories and non-outflow amounts", () => {
    const transactions = [
      tx({ id: "1", amount: -25, category_id: income.id }),
      tx({ id: "2", amount: 25, category_id: spending.id }),
    ];
    const rows = dailySpendByCategory(
      transactions,
      categories,
      institutions,
      new Set(),
      "2026-09-20",
    );
    expect(rows).toHaveLength(0);
  });

  it("excludes internal transfer legs even when categorized", () => {
    const transactions = [
      tx({ id: "1", amount: -40, category_id: spending.id, transfer_group_id: "g1" }),
    ];
    const rows = dailySpendByCategory(
      transactions,
      categories,
      institutions,
      new Set(["g1"]),
      "2026-09-20",
    );
    expect(rows).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* ADR-108: billsDebtsPaidOnDay                                        */
/* ------------------------------------------------------------------ */

describe("billsDebtsPaidOnDay", () => {
  const bills: Bill[] = [{ id: "bill-1", name: "Electric", category_id: "cat-1" } as Bill];
  const debts: Debt[] = [{ id: "debt-1", name: "Car Loan", category_id: "cat-2" } as Debt];

  it("groups by linked bill/debt id and sums same-day payments", () => {
    const transactions = [
      tx({ id: "1", amount: -100, linked_bill_id: "bill-1" }),
      tx({ id: "2", amount: 100, linked_bill_id: "bill-1" }), // e.g. a same-day reversal
      tx({ id: "3", amount: -50, linked_debt_id: "debt-1" }),
      tx({ id: "4", amount: -999, linked_bill_id: "bill-1", transaction_date: "2026-09-19" }),
    ];
    const items = billsDebtsPaidOnDay(transactions, bills, debts, "2026-09-20");
    expect(items).toEqual(
      expect.arrayContaining([
        { kind: "bill", id: "bill-1", name: "Electric", categoryId: "cat-1", amount: 0 },
        { kind: "debt", id: "debt-1", name: "Car Loan", categoryId: "cat-2", amount: -50 },
      ]),
    );
  });

  it("includes pending transactions, not just cleared", () => {
    const transactions = [
      tx({ id: "1", amount: -60, linked_bill_id: "bill-1", status: "pending" }),
    ];
    const items = billsDebtsPaidOnDay(transactions, bills, [], "2026-09-20");
    expect(items).toEqual([
      { kind: "bill", id: "bill-1", name: "Electric", categoryId: "cat-1", amount: -60 },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* ADR-108: dailySpendSeries                                           */
/* ------------------------------------------------------------------ */

describe("dailySpendSeries", () => {
  it("returns one point per day in [start, end), zero-filled, spend includes bill/debt payments", () => {
    const transactions = [
      tx({ id: "1", amount: -20, transaction_date: "2026-09-01", linked_bill_id: "bill-1" }),
      tx({ id: "2", amount: -5, transaction_date: "2026-09-02" }),
      tx({ id: "3", amount: -999, transaction_date: "2026-09-05" }), // outside range
    ];
    const points = dailySpendSeries(transactions, new Set(), "2026-09-01", "2026-09-04");
    expect(points).toEqual([
      { date: "2026-09-01", amount: 20 },
      { date: "2026-09-02", amount: 5 },
      { date: "2026-09-03", amount: 0 },
    ]);
  });
});
