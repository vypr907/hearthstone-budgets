import { describe, expect, it } from "vitest";
import { actualByCategoryInRange, monthlyIncomeVsExpenses, projectOccurrences } from "@/lib/paycheck-budget";
import type { Category, Transaction } from "@/lib/supabase";

/**
 * ADR-060: projectOccurrences walks a bill/debt forward one billing cycle at a
 * time from its stored due date, returning only future occurrences (never the
 * stored date itself) up to and including `throughDate`. It reuses shiftDateSafe
 * for the interval math, so month-length clamping and the missing-custom-interval
 * fallback are inherited from there, not re-implemented here.
 */
describe("projectOccurrences", () => {
  it("projects monthly occurrences after the stored due date", () => {
    expect(
      projectOccurrences({ billing_cycle: "monthly" }, "2026-01-15", "2026-04-30"),
    ).toEqual(["2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("projects biweekly occurrences in 14-day steps", () => {
    expect(
      projectOccurrences({ billing_cycle: "biweekly" }, "2026-01-01", "2026-02-15"),
    ).toEqual(["2026-01-15", "2026-01-29", "2026-02-12"]);
  });

  it("never returns the stored due date itself — the first result is strictly later", () => {
    const out = projectOccurrences(
      { billing_cycle: "monthly", next_due_date: "2026-03-10" },
      "2026-03-10",
      "2026-06-30",
    );
    expect(out).not.toContain("2026-03-10");
    expect(out[0]).toBe("2026-04-10");
  });

  it("includes an occurrence that lands exactly on throughDate", () => {
    expect(
      projectOccurrences({ billing_cycle: "monthly" }, "2026-01-15", "2026-02-15"),
    ).toEqual(["2026-02-15"]);
  });

  it("returns nothing when the next occurrence is past throughDate", () => {
    expect(
      projectOccurrences({ billing_cycle: "monthly" }, "2026-01-15", "2026-02-01"),
    ).toEqual([]);
  });

  it("defaults an unset billing cycle to monthly", () => {
    expect(
      projectOccurrences({}, "2026-01-15", "2026-03-31"),
    ).toEqual(["2026-02-15", "2026-03-15"]);
  });

  it("skips one-time payables (invoices never roll forward)", () => {
    expect(
      projectOccurrences({ billing_cycle: "one_time" }, "2026-01-15", "2027-01-01"),
    ).toEqual([]);
  });

  it("returns nothing without a from date", () => {
    expect(projectOccurrences({ billing_cycle: "monthly" }, null, "2026-06-30")).toEqual([]);
    expect(projectOccurrences({ billing_cycle: "monthly" }, undefined, "2026-06-30")).toEqual([]);
  });

  it("ignores a time component on the from date", () => {
    expect(
      projectOccurrences(
        { billing_cycle: "monthly" },
        "2026-01-15T09:30:00Z",
        "2026-03-20",
      ),
    ).toEqual(["2026-02-15", "2026-03-15"]);
  });

  it("projects a custom cycle by its interval in days", () => {
    expect(
      projectOccurrences(
        { billing_cycle: "custom", cycle_interval_days: 10 },
        "2026-01-01",
        "2026-02-01",
      ),
    ).toEqual(["2026-01-11", "2026-01-21", "2026-01-31"]);
  });

  it("returns nothing for a custom cycle with no interval set (shiftDateSafe can't advance it)", () => {
    expect(
      projectOccurrences({ billing_cycle: "custom" }, "2026-01-01", "2026-06-01"),
    ).toEqual([]);
  });

  it("projects quarterly occurrences", () => {
    expect(
      projectOccurrences({ billing_cycle: "quarterly" }, "2026-01-15", "2026-12-31"),
    ).toEqual(["2026-04-15", "2026-07-15", "2026-10-15"]);
  });

  it("inherits shiftDate's month-end clamping (Jan 31 -> Feb 28, then holds the clamped day)", () => {
    expect(
      projectOccurrences({ billing_cycle: "monthly" }, "2026-01-31", "2026-04-01"),
    ).toEqual(["2026-02-28", "2026-03-28"]);
  });
});

describe("monthlyIncomeVsExpenses", () => {
  const categories: Category[] = [
    { id: "salary", household_id: "h", name: "Salary", domain: "income", parent_category: null },
    { id: "groceries", household_id: "h", name: "Groceries", domain: "spending", parent_category: null },
  ];

  function tx(partial: Partial<Transaction> & { amount: number; transaction_date: string }): Transaction {
    return {
      id: partial.id ?? crypto.randomUUID(),
      household_id: "h",
      account_id: null,
      category_id: partial.category_id ?? null,
      amount: partial.amount,
      status: "cleared",
      description: null,
      transaction_date: partial.transaction_date,
      linked_bill_id: null,
      linked_debt_id: null,
    } as Transaction;
  }

  it("buckets income and expenses into separate monthly totals", () => {
    const out = monthlyIncomeVsExpenses(
      [
        tx({ amount: 2000, category_id: "salary", transaction_date: "2026-01-05" }),
        tx({ amount: -300, category_id: "groceries", transaction_date: "2026-01-10" }),
        tx({ amount: 2000, category_id: "salary", transaction_date: "2026-02-05" }),
        tx({ amount: -150, category_id: "groceries", transaction_date: "2026-02-12" }),
      ],
      categories,
      "2026-01-01",
      "2026-12-31",
    );
    expect(out).toEqual([
      { date: "2026-01-01", label: "Jan", income: 2000, expenses: 300 },
      { date: "2026-02-01", label: "Feb", income: 2000, expenses: 150 },
    ]);
  });

  it("excludes transactions outside the range", () => {
    const out = monthlyIncomeVsExpenses(
      [
        tx({ amount: 2000, category_id: "salary", transaction_date: "2025-12-31" }),
        tx({ amount: -300, category_id: "groceries", transaction_date: "2027-01-01" }),
      ],
      categories,
      "2026-01-01",
      "2026-12-31",
    );
    expect(out).toEqual([]);
  });

  it("ignores a negative amount on an income category (e.g. a correction) rather than counting it as an expense", () => {
    const out = monthlyIncomeVsExpenses(
      [tx({ amount: -50, category_id: "salary", transaction_date: "2026-01-05" })],
      categories,
      "2026-01-01",
      "2026-12-31",
    );
    expect(out).toEqual([]);
  });

  it("returns an empty array for no matching transactions", () => {
    expect(monthlyIncomeVsExpenses([], categories, "2026-01-01", "2026-12-31")).toEqual([]);
  });
});

/**
 * ADR-089 addendum: a transfer's negative leg can carry a spending category
 * (ADR-064 applies one category to both rows of the pair), but a two-sided
 * transfer isn't money leaving the household. Found live: a $25 transfer
 * tagged "Home & Garden" was inflating the Dashboard/Simple category tile's
 * total by $25 beyond what its own institution-breakdown drill-down showed
 * (that drill-down already excluded internal transfers; this total didn't).
 */
describe("actualByCategoryInRange excludes two-sided transfers (ADR-089 addendum)", () => {
  const categories: Category[] = [
    { id: "home", household_id: "h", name: "Home & Garden", domain: "spending", parent_category: null },
  ];

  function tx(partial: Partial<Transaction> & { amount: number; transaction_date: string }): Transaction {
    return {
      id: partial.id ?? crypto.randomUUID(),
      household_id: "h",
      account_id: null,
      category_id: partial.category_id ?? null,
      amount: partial.amount,
      status: "cleared",
      description: null,
      transaction_date: partial.transaction_date,
      linked_bill_id: null,
      linked_debt_id: null,
      transfer_group_id: partial.transfer_group_id ?? null,
    } as Transaction;
  }

  it("counts a categorized transfer's negative leg as spend when no internal-transfer set is passed", () => {
    const out = actualByCategoryInRange(
      [tx({ amount: -25, category_id: "home", transaction_date: "2026-09-16", transfer_group_id: "g1" })],
      [],
      [],
      categories,
      "2026-09-01",
      "2026-10-01",
    );
    expect(out.get("home")?.spendingSpent).toBe(25);
  });

  it("excludes it once its transfer_group_id is in the internal-transfer set", () => {
    const out = actualByCategoryInRange(
      [
        tx({ amount: -25, category_id: "home", transaction_date: "2026-09-16", transfer_group_id: "g1" }),
        tx({ amount: -16.84, category_id: "home", transaction_date: "2026-09-11" }),
      ],
      [],
      [],
      categories,
      "2026-09-01",
      "2026-10-01",
      new Set(["g1"]),
    );
    expect(out.get("home")?.spendingSpent).toBe(16.84);
  });
});
