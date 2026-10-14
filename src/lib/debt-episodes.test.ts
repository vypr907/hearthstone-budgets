import { describe, expect, it } from "vitest";
import { computeAdvanceEpisodes } from "@/lib/debt-episodes";
import type { Account, AccountBalance, Debt, DebtAdjustment, Transaction } from "@/lib/supabase";

/**
 * Dave ExtraCash's real `debt_adjustments` + transaction history, in its
 * unlinked shape — the exact fixture already proven correct in
 * debt-history.test.ts (reconstructs to the known-correct $45.00 live
 * balance). Reused here unmodified so this module's per-episode math can be
 * cross-checked against that already-verified total: the last episode's
 * `net` must equal $45.00.
 */
const daveId = "da042cbb-9173-46ab-8c8d-376dab131600";
const daveUnlinked: Pick<Debt, "id" | "debt_type" | "linked_account_id"> = {
  id: daveId,
  debt_type: "advance",
  linked_account_id: null,
};

const daveAdjustments: DebtAdjustment[] = [
  {
    id: "1",
    household_id: "h",
    debt_id: daveId,
    amount: 40,
    adjustment_type: "advance",
    description: null,
    adjustment_date: "2026-07-17",
    affects_balance: true,
  },
  {
    id: "2",
    household_id: "h",
    debt_id: daveId,
    amount: 35,
    adjustment_type: "advance",
    description: null,
    adjustment_date: "2026-07-18",
    affects_balance: true,
  },
  {
    id: "3",
    household_id: "h",
    debt_id: daveId,
    amount: 50,
    adjustment_type: "advance",
    description: null,
    adjustment_date: "2026-08-20",
    affects_balance: true,
  },
  {
    id: "4",
    household_id: "h",
    debt_id: daveId,
    amount: 50,
    adjustment_type: "advance",
    description: null,
    adjustment_date: "2026-09-04",
    affects_balance: true,
  },
  {
    id: "5",
    household_id: "h",
    debt_id: daveId,
    amount: 50,
    adjustment_type: "advance",
    description: null,
    adjustment_date: "2026-09-04",
    affects_balance: true,
  },
  {
    id: "6",
    household_id: "h",
    debt_id: daveId,
    amount: 5,
    adjustment_type: "other",
    description: null,
    adjustment_date: "2026-09-04",
    affects_balance: true,
  },
  {
    id: "7",
    household_id: "h",
    debt_id: daveId,
    amount: 5,
    adjustment_type: "other",
    description: null,
    adjustment_date: "2026-09-04",
    affects_balance: true,
  },
  {
    id: "8",
    household_id: "h",
    debt_id: daveId,
    amount: 50,
    adjustment_type: "advance",
    description: null,
    adjustment_date: "2026-09-14",
    affects_balance: true,
  },
];

function tx(
  partial: Partial<Transaction> & { amount: number; transaction_date: string },
): Transaction {
  return {
    id: partial.id ?? crypto.randomUUID(),
    household_id: "h",
    account_id: partial.account_id ?? null,
    category_id: null,
    amount: partial.amount,
    status: partial.status ?? "cleared",
    description: partial.description ?? null,
    transaction_date: partial.transaction_date,
    cleared_date: partial.cleared_date ?? null,
    linked_bill_id: null,
    linked_debt_id: partial.linked_debt_id ?? null,
    created_at: partial.created_at ?? "",
    updated_at: partial.updated_at ?? "",
  } as Transaction;
}

const daveTransactions: Transaction[] = [
  tx({
    id: "t1",
    amount: 40,
    transaction_date: "2026-06-17",
    cleared_date: "2026-07-17",
    description: "Advance: Dave ExtraCash",
    linked_debt_id: daveId,
  }),
  tx({
    id: "t2",
    amount: 35,
    transaction_date: "2026-06-18",
    cleared_date: "2026-07-18",
    description: "Advance: Dave ExtraCash",
    linked_debt_id: daveId,
  }),
  tx({
    id: "t3",
    amount: -75,
    transaction_date: "2026-07-31",
    cleared_date: "2026-07-31",
    description: "Debt payment · Dave ExtraCash",
    linked_debt_id: daveId,
  }),
  tx({
    id: "t4",
    amount: 50,
    transaction_date: "2026-08-20",
    cleared_date: "2026-08-20",
    description: "Advance: Dave ExtraCash",
    linked_debt_id: daveId,
  }),
  tx({
    id: "t5",
    amount: -25,
    transaction_date: "2026-08-27",
    cleared_date: "2026-08-27",
    description: "Debt payment · Dave ExtraCash",
    linked_debt_id: daveId,
  }),
  tx({
    id: "t6",
    amount: -25,
    transaction_date: "2026-08-27",
    cleared_date: "2026-08-27",
    description: "Debt payment · Dave ExtraCash",
    linked_debt_id: daveId,
  }),
  tx({
    id: "t7",
    amount: 50,
    transaction_date: "2026-09-04",
    cleared_date: null,
    description: "Advance: Dave ExtraCash",
    linked_debt_id: daveId,
  }),
  tx({
    id: "t8",
    amount: 50,
    transaction_date: "2026-09-04",
    cleared_date: null,
    description: "Advance: Dave ExtraCash",
    linked_debt_id: daveId,
  }),
  tx({
    id: "t9",
    amount: -5,
    transaction_date: "2026-09-11",
    cleared_date: "2026-09-11",
    description: "Debt payment · Dave ExtraCash",
    linked_debt_id: daveId,
  }),
  tx({
    id: "t10",
    amount: -105,
    transaction_date: "2026-09-11",
    cleared_date: "2026-09-11",
    description: "Debt payment · Dave ExtraCash",
    linked_debt_id: daveId,
  }),
  tx({
    id: "t11",
    amount: -5,
    transaction_date: "2026-09-14",
    cleared_date: null,
    description: "Advance Fee",
    linked_debt_id: daveId,
  }),
  tx({
    id: "t12",
    amount: 50,
    transaction_date: "2026-09-14",
    cleared_date: null,
    description: "Advance: Dave ExtraCash",
    linked_debt_id: daveId,
  }),
];

describe("computeAdvanceEpisodes — unlinked (Dave ExtraCash's real history)", () => {
  it("returns [] for a non-advance debt", () => {
    expect(
      computeAdvanceEpisodes(
        { ...daveUnlinked, debt_type: "credit card" },
        daveAdjustments,
        daveTransactions,
      ),
    ).toEqual([]);
  });

  it("returns [] when there's no advance history yet", () => {
    expect(computeAdvanceEpisodes(daveUnlinked, [], [])).toEqual([]);
  });

  it("partitions into one episode per advance marker, including the two same-day 2026-09-04 draws as distinct episodes", () => {
    const episodes = computeAdvanceEpisodes(daveUnlinked, daveAdjustments, daveTransactions);
    expect(episodes).toHaveLength(6);
    expect(episodes.map((e) => e.markerId)).toEqual(["1", "2", "3", "4", "5", "8"]);
  });

  it("carries an underpaid draw's shortfall into the next episode instead of resetting", () => {
    const episodes = computeAdvanceEpisodes(daveUnlinked, daveAdjustments, daveTransactions);
    // Episode for marker "1" ($40, 7/17): no repayment before the 7/18 draw -> carried forward.
    expect(episodes[0]).toMatchObject({
      advanceAmount: 40,
      feesTotal: 0,
      repaidTotal: 0,
      net: 40,
      status: "carried_forward",
    });
    // Episode for marker "2" ($35, 7/18): the 7/31 $75 payment covers both it and marker 1's carry-in.
    expect(episodes[1]).toMatchObject({
      advanceAmount: 35,
      repaidTotal: 75,
      net: 0,
      status: "repaid",
    });
  });

  it("attributes the two same-day 2026-09-04 $5 fees to whichever episode they fall into, without double-counting or dropping either", () => {
    const episodes = computeAdvanceEpisodes(daveUnlinked, daveAdjustments, daveTransactions);
    const sameDayEpisodes = episodes.filter((e) => e.startDate === "2026-09-04");
    expect(sameDayEpisodes).toHaveLength(2);
    const totalFees = sameDayEpisodes.reduce((s, e) => s + e.feesTotal, 0);
    expect(totalFees).toBeCloseTo(10, 2); // both $5 "other" adjustments land somewhere, once each
  });

  it("reconstructs to the same known-correct $45.00 live balance debtBalanceAsOf already verifies", () => {
    const episodes = computeAdvanceEpisodes(daveUnlinked, daveAdjustments, daveTransactions);
    expect(episodes[episodes.length - 1].net).toBeCloseTo(45, 2);
    expect(episodes[episodes.length - 1].status).toBe("open");
  });

  it("never lets net or a per-episode total go negative", () => {
    const episodes = computeAdvanceEpisodes(daveUnlinked, daveAdjustments, daveTransactions);
    for (const e of episodes) {
      expect(e.net).toBeGreaterThanOrEqual(0);
      expect(e.feesTotal).toBeGreaterThanOrEqual(0);
      expect(e.repaidTotal).toBeGreaterThanOrEqual(0);
    }
  });

  it("nets a reversed-then-redone repayment to the single real payment, with no special-casing", () => {
    // -225 (payment), +225 (reversal, restores what's owed), -225 (redone) == one net $225 payment.
    const onePayId = "onepay-1";
    const onePay: Pick<Debt, "id" | "debt_type" | "linked_account_id"> = {
      id: onePayId,
      debt_type: "advance",
      linked_account_id: null,
    };
    const onePayAdjustments: DebtAdjustment[] = [
      {
        id: "o1",
        household_id: "h",
        debt_id: onePayId,
        amount: 225,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-07-17",
        affects_balance: true,
      },
    ];
    const onePayTransactions: Transaction[] = [
      tx({
        id: "p1",
        amount: -225,
        transaction_date: "2026-09-09",
        cleared_date: "2026-09-09",
        description: "Debt payment · OnePay Advance",
        linked_debt_id: onePayId,
      }),
      tx({
        id: "p2",
        amount: 225,
        transaction_date: "2026-09-09",
        cleared_date: "2026-09-09",
        description: "Reversed: OnePay Advance payment",
        linked_debt_id: onePayId,
      }),
      tx({
        id: "p3",
        amount: -225,
        transaction_date: "2026-09-09",
        cleared_date: "2026-09-09",
        description: "Debt payment · OnePay Advance",
        linked_debt_id: onePayId,
      }),
    ];
    const episodes = computeAdvanceEpisodes(onePay, onePayAdjustments, onePayTransactions);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({ advanceAmount: 225, net: 0, status: "repaid" });
  });

  it("buckets a pre-tracking orphan disbursement into an unmarked episode 0, and carries an unpaid draw forward when a later draw follows", () => {
    const onePayId = "onepay-2";
    const onePay: Pick<Debt, "id" | "debt_type" | "linked_account_id"> = {
      id: onePayId,
      debt_type: "advance",
      linked_account_id: null,
    };
    const adjustments: DebtAdjustment[] = [
      {
        id: "m1",
        household_id: "h",
        debt_id: onePayId,
        amount: 225,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-07-17",
        affects_balance: true,
      },
      {
        id: "m2",
        household_id: "h",
        debt_id: onePayId,
        amount: 225,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-08-20",
        affects_balance: true,
      },
    ];
    const transactions: Transaction[] = [
      // Orphan: predates the first marker, no matching debt_adjustments row (a real gap found on OnePay Advance).
      tx({
        id: "orphan",
        amount: 225,
        transaction_date: "2026-07-02",
        cleared_date: "2026-07-02",
        description: "Advance: OnePay Advance",
        linked_debt_id: onePayId,
      }),
      tx({
        id: "d1",
        amount: 225,
        transaction_date: "2026-07-17",
        cleared_date: "2026-07-17",
        description: "Advance: OnePay Advance",
        linked_debt_id: onePayId,
      }),
      // No repayment logged between the two draws.
      tx({
        id: "d2",
        amount: 225,
        transaction_date: "2026-08-20",
        cleared_date: "2026-08-20",
        description: "Advance: OnePay Advance",
        linked_debt_id: onePayId,
      }),
    ];
    const episodes = computeAdvanceEpisodes(onePay, adjustments, transactions);
    expect(episodes).toHaveLength(3);
    expect(episodes[0]).toMatchObject({
      markerId: null,
      advanceAmount: 225,
      status: "carried_forward",
    });
    expect(episodes[1]).toMatchObject({
      markerId: "m1",
      advanceAmount: 225,
      net: 450,
      status: "carried_forward",
    });
    expect(episodes[2]).toMatchObject({
      markerId: "m2",
      advanceAmount: 225,
      net: 675,
      status: "open",
    });
  });
});

describe("computeAdvanceEpisodes — linked (the Problem 2 regression case)", () => {
  const linkedAccountId = "e62e92f6-5029-4ce2-b28c-23c3db6dc50e";
  const daveLinked: Pick<Debt, "id" | "debt_type" | "linked_account_id"> = {
    id: daveId,
    debt_type: "advance",
    linked_account_id: linkedAccountId,
  };
  const marker: DebtAdjustment = {
    id: "m1",
    household_id: "h",
    debt_id: daveId,
    amount: 50,
    adjustment_type: "advance",
    description: null,
    adjustment_date: "2026-09-14",
    affects_balance: true,
  };

  it("sums the account's own transactions by sign, ignoring linked_debt_id tagging entirely", () => {
    const transactions: Transaction[] = [
      // The disbursement mirror leg — excluded from content via amount/date matching.
      tx({
        id: "mirror",
        amount: -50,
        account_id: linkedAccountId,
        transaction_date: "2026-09-14",
        description: "Advance: Dave ExtraCash",
      }),
      // A real fee, hand-entered with linked_debt_id set directly on the account (the live shape).
      tx({
        id: "fee",
        amount: -5,
        account_id: linkedAccountId,
        transaction_date: "2026-09-14",
        description: "Advance Fee",
        linked_debt_id: daveId,
      }),
      // A real $15 repayment — properly tagged on the mirror leg's side (tag is irrelevant here; account is ground truth).
      tx({ id: "pay1", amount: 15, account_id: linkedAccountId, transaction_date: "2026-09-24" }),
    ];
    const episodes = computeAdvanceEpisodes(daveLinked, [marker], transactions);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      advanceAmount: 50,
      feesTotal: 5,
      repaidTotal: 15,
      net: 40,
      status: "open",
    });
  });

  it("REGRESSION (Problem 2): counts a plain, untagged duplicate Transfer the same as a properly-tagged payment — the real bug this view exists to catch", () => {
    const transactions: Transaction[] = [
      tx({
        id: "mirror",
        amount: -50,
        account_id: linkedAccountId,
        transaction_date: "2026-09-14",
        description: "Advance: Dave ExtraCash",
      }),
      tx({
        id: "fee",
        amount: -5,
        account_id: linkedAccountId,
        transaction_date: "2026-09-14",
        description: "Advance Fee",
        linked_debt_id: daveId,
      }),
      // The real duplicate shape: one untagged plain transfer leg, no linked_debt_id anywhere...
      tx({
        id: "dup-untagged",
        amount: 15,
        account_id: linkedAccountId,
        transaction_date: "2026-09-24",
      }),
      // ...and one properly-tagged re-entry of "the same" $15, made later because the first was invisible
      // to a linked_debt_id-filtered view. The account itself doesn't know they're duplicates — it just
      // sees two real $15 credits, which is exactly the point: this view surfaces the double-payment
      // (net overstates repayment) instead of silently hiding half of it like the old flat list did.
      tx({
        id: "dup-tagged",
        amount: 15,
        account_id: linkedAccountId,
        transaction_date: "2026-09-24",
        linked_debt_id: daveId,
      }),
    ];
    const episodes = computeAdvanceEpisodes(daveLinked, [marker], transactions);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      advanceAmount: 50,
      feesTotal: 5,
      repaidTotal: 30,
      net: 25,
    });
  });

  it("deterministically pairs a same-day double-advance's two mirror legs to their own markers (no cross-pairing)", () => {
    const markers: DebtAdjustment[] = [
      {
        id: "ma",
        household_id: "h",
        debt_id: daveId,
        amount: 50,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-09-04",
        affects_balance: true,
      },
      {
        id: "mb",
        household_id: "h",
        debt_id: daveId,
        amount: 50,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-09-04",
        affects_balance: true,
      },
    ];
    const transactions: Transaction[] = [
      tx({
        id: "mirrorA",
        amount: -50,
        account_id: linkedAccountId,
        transaction_date: "2026-09-04",
      }),
      tx({
        id: "mirrorB",
        amount: -50,
        account_id: linkedAccountId,
        transaction_date: "2026-09-04",
      }),
    ];
    const episodes = computeAdvanceEpisodes(daveLinked, markers, transactions);
    expect(episodes).toHaveLength(2);
    // Both mirror legs consumed (excluded from content); neither episode's window has any leftover
    // transactions, so advanceAmount is the only contribution to each episode's net.
    expect(episodes[0]).toMatchObject({ advanceAmount: 50, feesTotal: 0, repaidTotal: 0 });
    expect(episodes[1].net).toBeCloseTo(100, 2); // marker A's $50 carries into marker B's own $50
  });

  it("REGRESSION: the open episode's net matches effectiveDebtBalance's account_balances anchor, not a naive full-history replay — found live against Dave ExtraCash's real data", () => {
    // Real shape: 6 advance markers spanning months (the earliest ones never
    // explicitly "closed out"), then an account_balances snapshot taken
    // 2026-09-14 (the exact live anchor: balance -55.00) which supersedes
    // everything before it. Naively replaying the whole carry-forward chain
    // from the first marker gives a wildly inflated number ($220+); the real
    // app only ever displays the anchor-based figure.
    const markers: DebtAdjustment[] = [
      { id: "old1", household_id: "h", debt_id: daveId, amount: 40, adjustment_type: "advance", description: null, adjustment_date: "2026-07-17", affects_balance: true },
      { id: "old2", household_id: "h", debt_id: daveId, amount: 35, adjustment_type: "advance", description: null, adjustment_date: "2026-07-18", affects_balance: true },
      { id: "current", household_id: "h", debt_id: daveId, amount: 50, adjustment_type: "advance", description: null, adjustment_date: "2026-09-14", affects_balance: true },
    ];
    const transactions: Transaction[] = [
      // Pre-anchor activity — none of this should reach the open episode's net.
      tx({ id: "old-mirror1", amount: -40, account_id: linkedAccountId, transaction_date: "2026-07-17" }),
      tx({ id: "old-mirror2", amount: -35, account_id: linkedAccountId, transaction_date: "2026-07-18" }),
      // The current draw's own mirror leg (consumed by its marker as usual).
      tx({ id: "current-mirror", amount: -50, account_id: linkedAccountId, transaction_date: "2026-09-14" }),
      // One real post-anchor repayment.
      tx({ id: "pay", amount: 15, account_id: linkedAccountId, transaction_date: "2026-09-24" }),
    ];
    const account: Account = {
      id: linkedAccountId,
      household_id: "h",
      institution_id: null,
      name: "Dave ExtraCash",
      account_type: "credit",
      starting_balance: 0,
      is_spendable: false,
      credit_limit: null,
      notes: null,
      created_at: "",
      updated_at: "",
    } as Account;
    const accountBalances: AccountBalance[] = [
      { id: "snap1", account_id: linkedAccountId, balance: -55, as_of_date: "2026-09-14", created_at: "" },
    ];

    const naive = computeAdvanceEpisodes(daveLinked, markers, transactions); // no accounts/accountBalances passed
    expect(naive[naive.length - 1].net).toBeGreaterThan(100); // the inflated, wrong number

    const anchored = computeAdvanceEpisodes(daveLinked, markers, transactions, [account], accountBalances);
    expect(anchored[anchored.length - 1].net).toBeCloseTo(40, 2); // abs(-55 + 15) — matches effectiveDebtBalance
    expect(anchored[anchored.length - 1].status).toBe("open");
    // Earlier (closed) episodes are untouched by the override — still shown for history.
    expect(anchored[0].markerId).toBe("old1");
  });
});
