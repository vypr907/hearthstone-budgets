import { describe, expect, it } from "vitest";
import { debtBalanceAsOf, debtPayoffTrend, totalPaidDownInYear } from "@/lib/debt-history";
import type { Debt, DebtAdjustment, Transaction } from "@/lib/supabase";

/**
 * Real data for two debts (Dave ExtraCash, EarnIn), pulled live via the
 * read-only Supabase MCP on 2026-09-15 — not synthesized. Both debts'
 * corrupted balances were hand-diagnosed and fixed by migration earlier in
 * this same session (2026-09-11-dave-extracash-fix.sql,
 * 2026-09-14-earnin-cycle-fix.sql), and both have since had further real
 * activity — reconstructing through everything below must land exactly on
 * their current live `remaining_balance` ($45.00 and $150.00), which is the
 * strongest available cross-check for this new module.
 */

const daveId = "da042cbb-9173-46ab-8c8d-376dab131600";
const dave: Pick<Debt, "id" | "starting_balance"> = { id: daveId, starting_balance: 0 };

const daveAdjustments: DebtAdjustment[] = [
  { id: "1", household_id: "h", debt_id: daveId, amount: 40, adjustment_type: "advance", description: null, adjustment_date: "2026-07-17", affects_balance: true },
  { id: "2", household_id: "h", debt_id: daveId, amount: 35, adjustment_type: "advance", description: null, adjustment_date: "2026-07-18", affects_balance: true },
  { id: "3", household_id: "h", debt_id: daveId, amount: 50, adjustment_type: "advance", description: null, adjustment_date: "2026-08-20", affects_balance: true },
  { id: "4", household_id: "h", debt_id: daveId, amount: 50, adjustment_type: "advance", description: null, adjustment_date: "2026-09-04", affects_balance: true },
  { id: "5", household_id: "h", debt_id: daveId, amount: 50, adjustment_type: "advance", description: null, adjustment_date: "2026-09-04", affects_balance: true },
  { id: "6", household_id: "h", debt_id: daveId, amount: 5, adjustment_type: "other", description: null, adjustment_date: "2026-09-04", affects_balance: true },
  { id: "7", household_id: "h", debt_id: daveId, amount: 5, adjustment_type: "other", description: null, adjustment_date: "2026-09-04", affects_balance: true },
  { id: "8", household_id: "h", debt_id: daveId, amount: 50, adjustment_type: "advance", description: null, adjustment_date: "2026-09-14", affects_balance: true },
];

function tx(partial: Partial<Transaction> & { amount: number; transaction_date: string }): Transaction {
  return {
    id: partial.id ?? crypto.randomUUID(),
    household_id: "h",
    account_id: null,
    category_id: null,
    amount: partial.amount,
    status: partial.status ?? "cleared",
    description: partial.description ?? null,
    transaction_date: partial.transaction_date,
    cleared_date: partial.cleared_date ?? null,
    linked_bill_id: null,
    linked_debt_id: partial.linked_debt_id ?? null,
  } as Transaction;
}

const daveTransactions: Transaction[] = [
  tx({ id: "t1", amount: 40, transaction_date: "2026-06-17", cleared_date: "2026-07-17", description: "Advance: Dave ExtraCash", linked_debt_id: daveId }),
  tx({ id: "t2", amount: 35, transaction_date: "2026-06-18", cleared_date: "2026-07-18", description: "Advance: Dave ExtraCash", linked_debt_id: daveId }),
  tx({ id: "t3", amount: -75, transaction_date: "2026-07-31", cleared_date: "2026-07-31", description: "Debt payment · Dave ExtraCash", linked_debt_id: daveId }),
  tx({ id: "t4", amount: 50, transaction_date: "2026-08-20", cleared_date: "2026-08-20", description: "Advance: Dave ExtraCash", linked_debt_id: daveId }),
  tx({ id: "t5", amount: -25, transaction_date: "2026-08-27", cleared_date: "2026-08-27", description: "Debt payment · Dave ExtraCash", linked_debt_id: daveId }),
  tx({ id: "t6", amount: -25, transaction_date: "2026-08-27", cleared_date: "2026-08-27", description: "Debt payment · Dave ExtraCash", linked_debt_id: daveId }),
  tx({ id: "t7", amount: 50, transaction_date: "2026-09-04", cleared_date: null, description: "Advance: Dave ExtraCash", linked_debt_id: daveId }),
  tx({ id: "t8", amount: 50, transaction_date: "2026-09-04", cleared_date: null, description: "Advance: Dave ExtraCash", linked_debt_id: daveId }),
  tx({ id: "t9", amount: -5, transaction_date: "2026-09-11", cleared_date: "2026-09-11", description: "Debt payment · Dave ExtraCash", linked_debt_id: daveId }),
  tx({ id: "t10", amount: -105, transaction_date: "2026-09-11", cleared_date: "2026-09-11", description: "Debt payment · Dave ExtraCash", linked_debt_id: daveId }),
  tx({ id: "t11", amount: -5, transaction_date: "2026-09-14", cleared_date: null, description: "Advance Fee", linked_debt_id: daveId }),
  tx({ id: "t12", amount: 50, transaction_date: "2026-09-14", cleared_date: null, description: "Advance: Dave ExtraCash", linked_debt_id: daveId }),
];

const earninId = "479bd94c-ce7f-4b04-91bb-a512e008cc01";
const earnin: Pick<Debt, "id" | "starting_balance"> = { id: earninId, starting_balance: 0 };

const earninAdjustments: DebtAdjustment[] = [
  { id: "e1", household_id: "h", debt_id: earninId, amount: 100, adjustment_type: "advance", description: null, adjustment_date: "2026-08-18", affects_balance: true },
  { id: "e2", household_id: "h", debt_id: earninId, amount: 100, adjustment_type: "advance", description: null, adjustment_date: "2026-09-14", affects_balance: true },
  { id: "e3", household_id: "h", debt_id: earninId, amount: 50, adjustment_type: "advance", description: null, adjustment_date: "2026-09-14", affects_balance: true },
];

const earninTransactions: Transaction[] = [
  tx({ id: "et1", amount: 100, transaction_date: "2026-08-18", cleared_date: "2026-08-18", description: "Advance: EarnIn", linked_debt_id: earninId }),
  tx({ id: "et2", amount: -100, transaction_date: "2026-08-28", cleared_date: "2026-08-28", description: "Debt payment · EarnIn", linked_debt_id: earninId }),
  tx({ id: "et3", amount: 100, transaction_date: "2026-09-14", cleared_date: null, description: "Advance: EarnIn", linked_debt_id: earninId }),
  tx({ id: "et4", amount: 50, transaction_date: "2026-09-14", cleared_date: null, description: "Advance: EarnIn", linked_debt_id: earninId }),
];

describe("debtBalanceAsOf", () => {
  it("reconstructs Dave ExtraCash's live balance ($45.00) through every recorded event", () => {
    expect(debtBalanceAsOf(dave, daveAdjustments, daveTransactions, "2026-09-15")).toBeCloseTo(45, 2);
  });

  it("reconstructs an intermediate checkpoint: fully repaid after the 8/27 payments, before the 9/4 advances", () => {
    expect(debtBalanceAsOf(dave, daveAdjustments, daveTransactions, "2026-08-31")).toBeCloseTo(0, 2);
  });

  it("reconstructs EarnIn's live balance ($150.00) through every recorded event", () => {
    expect(debtBalanceAsOf(earnin, earninAdjustments, earninTransactions, "2026-09-15")).toBeCloseTo(150, 2);
  });

  it("never counts an advance twice — excludes the disbursement leg already covered by debt_adjustments", () => {
    // Dave's 8/20 advance: debt_adjustments has +50 once; the linked deposit
    // transaction is the disbursement leg and must not add another +50.
    const onlyOneAdvance: DebtAdjustment[] = [daveAdjustments[2]];
    const onlyOneTx: Transaction[] = [daveTransactions[3]];
    expect(debtBalanceAsOf(dave, onlyOneAdvance, onlyOneTx, "2026-08-21")).toBeCloseTo(50, 2);
  });

  it("returns the starting balance for a date before any activity", () => {
    expect(debtBalanceAsOf(dave, daveAdjustments, daveTransactions, "2026-01-01")).toBe(0);
  });

  it("floors at 0 rather than going negative", () => {
    const overpaid: Transaction[] = [
      ...daveTransactions,
      tx({ id: "t99", amount: -1000, transaction_date: "2026-09-15", linked_debt_id: daveId }),
    ];
    expect(debtBalanceAsOf(dave, daveAdjustments, overpaid, "2026-09-15")).toBe(0);
  });
});

describe("debtPayoffTrend", () => {
  it("produces one point per elapsed month, ending on the reference date for the current year", () => {
    const points = debtPayoffTrend(
      [dave],
      daveAdjustments,
      daveTransactions,
      2026,
      new Date(2026, 8, 15), // Sept 15, 2026 — month index 8
    );
    expect(points).toHaveLength(9); // Jan..Sep
    expect(points[points.length - 1].total).toBeCloseTo(45, 2);
  });

  it("uses full Dec 31 month-end points for a past year, never projecting past it", () => {
    const points = debtPayoffTrend([dave], daveAdjustments, daveTransactions, 2025, new Date(2026, 8, 15));
    expect(points).toHaveLength(12);
    expect(points.every((p) => p.total === 0)).toBe(true); // no activity happened in 2025
  });
});

describe("totalPaidDownInYear", () => {
  const payoffId = "payoff-only-debt";
  const payoffDebt: Pick<Debt, "id" | "starting_balance"> = { id: payoffId, starting_balance: 1000 };
  // A debt that was $1000 at the prior year-end and is $400 by the reference
  // date — a straightforward $600 of real progress, no advances involved.
  const payoffTransactions: Transaction[] = [
    tx({ id: "p1", amount: -600, transaction_date: "2026-03-01", cleared_date: "2026-03-01", linked_debt_id: payoffId }),
  ];

  it("reports real progress for a debt that shrank over the year", () => {
    expect(
      totalPaidDownInYear([payoffDebt], [], payoffTransactions, 2026, new Date(2026, 8, 15)),
    ).toBeCloseTo(600, 2);
  });

  it("reports $0 paid down for a debt that didn't exist yet at the prior year-end", () => {
    // EarnIn's whole history is inside 2026 — nothing to have paid down as of 2025-12-31.
    expect(
      totalPaidDownInYear([earnin], earninAdjustments, earninTransactions, 2026, new Date(2026, 8, 15)),
    ).toBe(0);
  });

  it("floors each debt's contribution at 0 so a debt that grew doesn't offset one that shrank", () => {
    // Dave grew net-net from 2025-12-31 ($0) to today ($45) — contributes 0,
    // not a negative that would otherwise eat into the payoff debt's real $600.
    const total = totalPaidDownInYear(
      [dave, payoffDebt],
      daveAdjustments,
      [...daveTransactions, ...payoffTransactions],
      2026,
      new Date(2026, 8, 15),
    );
    expect(total).toBeCloseTo(600, 2);
  });
});
