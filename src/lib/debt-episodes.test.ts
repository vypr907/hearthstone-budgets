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

  it("carries an underpaid draw's shortfall into the next episode, then retroactively resolves both once it's paid off", () => {
    const episodes = computeAdvanceEpisodes(daveUnlinked, daveAdjustments, daveTransactions);
    // Episode for marker "1" ($40, 7/17): no repayment before the 7/18 draw, so its
    // own window carries a shortfall — but the 7/31 payment (inside marker 2's
    // window) clears it, so it retroactively reads "repaid," not stuck at
    // "carried forward" forever just because the resolution landed one window later.
    expect(episodes[0]).toMatchObject({
      advanceAmount: 40,
      feesTotal: 0,
      repaidTotal: 0,
      net: 40,
      status: "repaid",
    });
    // Episode for marker "2" ($35, 7/18): the 7/31 $75 payment covers both it and marker 1's carry-in.
    expect(episodes[1]).toMatchObject({
      advanceAmount: 35,
      repaidTotal: 75,
      net: 0,
      status: "repaid",
    });
  });

  it("leaves a shortfall genuinely marked carried_forward when it's never resolved before the end of the chain", () => {
    // A debt whose first advance is never repaid before the second (unlike
    // Dave's real history, where every shortfall eventually clears) must
    // still show the truth: carried_forward, not a false "repaid."
    const neverResolvedId = "never-resolved-1";
    const neverResolved: Pick<Debt, "id" | "debt_type" | "linked_account_id"> = {
      id: neverResolvedId,
      debt_type: "advance",
      linked_account_id: null,
    };
    const adj: DebtAdjustment[] = [
      {
        id: "n1",
        household_id: "h",
        debt_id: neverResolvedId,
        amount: 100,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-01-01",
        affects_balance: true,
      },
      {
        id: "n2",
        household_id: "h",
        debt_id: neverResolvedId,
        amount: 50,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-02-01",
        affects_balance: true,
      },
    ];
    const episodes = computeAdvanceEpisodes(neverResolved, adj, []);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]).toMatchObject({ net: 100, status: "carried_forward" });
    expect(episodes[1]).toMatchObject({ net: 150, status: "open" });
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

  it("REGRESSION: the first-ever marker's own disbursement isn't misclassified as a pre-tracking orphan and double-counted — found live on EarnIn", () => {
    // useCreateAdvance inserts the disbursement transaction (Step 1) a
    // fraction of a second BEFORE its debt_adjustments row (Step 3) — so
    // for a debt's very first tracked advance, the disbursement's own
    // created_at can sort as earlier than the marker's, even though both
    // are the same real event. Naively comparing txKey < firstKey treated
    // this as a "pre-tracking orphan disbursement" (the real OnePay case),
    // double-counting the $100 draw (once via the orphan bucket, once via
    // the marker's own advanceAmount) and permanently inflating every
    // later episode's carried balance so nothing ever resolved.
    const id = "earnin-regression";
    const debt: Pick<Debt, "id" | "debt_type" | "linked_account_id"> = {
      id,
      debt_type: "advance",
      linked_account_id: null,
    };
    const adjustments: DebtAdjustment[] = [
      {
        id: "m1",
        household_id: "h",
        debt_id: id,
        amount: 100,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-08-18",
        created_at: "2026-08-19 16:18:02.984354+00",
        affects_balance: true,
      },
    ];
    const transactions: Transaction[] = [
      tx({
        id: "disbursement",
        amount: 100,
        transaction_date: "2026-08-18",
        cleared_date: "2026-08-18",
        description: "Advance: EarnIn",
        linked_debt_id: id,
        created_at: "2026-08-19 16:18:02.381332+00", // earlier than the marker's own created_at above
      }),
      tx({
        id: "payment",
        amount: -100,
        transaction_date: "2026-08-28",
        cleared_date: "2026-08-28",
        description: "Debt payment · EarnIn",
        linked_debt_id: id,
        created_at: "2026-08-29 02:48:29.775946+00",
      }),
    ];
    const episodes = computeAdvanceEpisodes(debt, adjustments, transactions);
    expect(episodes).toHaveLength(1); // no phantom "episode 0" from a misdetected orphan
    expect(episodes[0]).toMatchObject({
      markerId: "m1",
      advanceAmount: 100,
      repaidTotal: 100,
      net: 0, // not 100 — the disbursement must not be double-counted
      status: "repaid",
    });
  });

  it("REGRESSION: a debt fully paid off by its own final episode retroactively resolves every earlier pending episode too — found live on EarnIn", () => {
    // The chain's shortfall never clears exactly at any INTERMEDIATE
    // window boundary, only by the time the final (otherwise 'open')
    // window's own payment lands — a debt that's actually fully settled
    // must not leave earlier episodes stuck showing "carried forward"
    // just because the resolution happened to land on the very last window.
    const id = "earnin-regression-2";
    const debt: Pick<Debt, "id" | "debt_type" | "linked_account_id"> = {
      id,
      debt_type: "advance",
      linked_account_id: null,
    };
    const adjustments: DebtAdjustment[] = [
      {
        id: "m1",
        household_id: "h",
        debt_id: id,
        amount: 100,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-09-01",
        affects_balance: true,
      },
      {
        id: "m2",
        household_id: "h",
        debt_id: id,
        amount: 50,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-09-08",
        affects_balance: true,
      },
    ];
    const transactions: Transaction[] = [
      tx({
        id: "d1",
        amount: 100,
        transaction_date: "2026-09-01",
        description: "Advance: EarnIn",
        linked_debt_id: id,
      }),
      tx({
        id: "d2",
        amount: 50,
        transaction_date: "2026-09-08",
        description: "Advance: EarnIn",
        linked_debt_id: id,
      }),
      // Nothing repaid until a single payment, inside m2's own window, that
      // happens to cover the entire remaining 150 (100 carried in + 50).
      tx({
        id: "payoff",
        amount: -150,
        transaction_date: "2026-09-10",
        description: "Debt payment · EarnIn",
        linked_debt_id: id,
      }),
    ];
    const episodes = computeAdvanceEpisodes(debt, adjustments, transactions);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]).toMatchObject({ markerId: "m1", net: 100, status: "repaid" });
    expect(episodes[1]).toMatchObject({ markerId: "m2", net: 0, status: "repaid" });
  });

  it("REGRESSION: a 'Fee: ' transaction never affects net — it's ledger-only (ADR-084), matching debtBalanceAsOf — found live on Cleo and Instacash", () => {
    // Cleo's real history: a $40 advance, fully repaid, plus a same-day
    // "Fee: Cleo · advance fee — Express fee" transaction that never
    // touched the real remaining_balance (confirmed: stored balance is
    // $0, not $6.99). An earlier version of this function counted every
    // "Fee: " transaction's abs amount into feesTotal (which fed net),
    // inflating the reconstructed balance above the real, confirmed-$0
    // figure by exactly the fee amount.
    const id = "cleo-regression";
    const debt: Pick<Debt, "id" | "debt_type" | "linked_account_id"> = {
      id,
      debt_type: "advance",
      linked_account_id: null,
    };
    const adjustments: DebtAdjustment[] = [
      {
        id: "m1",
        household_id: "h",
        debt_id: id,
        amount: 40,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-08-08",
        affects_balance: true,
      },
    ];
    const transactions: Transaction[] = [
      tx({
        id: "disbursement",
        amount: 40,
        transaction_date: "2026-08-08",
        description: "Advance: Cleo",
        linked_debt_id: id,
      }),
      tx({
        id: "fee",
        amount: -6.99,
        transaction_date: "2026-08-14",
        description: "Fee: Cleo · advance fee — Express fee",
        linked_debt_id: id,
      }),
      tx({
        id: "payment",
        amount: -40,
        transaction_date: "2026-08-14",
        description: "Debt payment · Cleo",
        linked_debt_id: id,
      }),
    ];
    const episodes = computeAdvanceEpisodes(debt, adjustments, transactions);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      advanceAmount: 40,
      feesTotal: 0, // the ledger-only fee never shows up here
      repaidTotal: 40,
      net: 0, // not 6.99
      status: "repaid",
    });
    // Still visible in the episode's raw transaction list, for transparency.
    expect(episodes[0].transactions.some((t) => t.id === "fee")).toBe(true);
  });

  it("REGRESSION: an early overpayment credit carries forward to offset a later draw instead of being floored away — found live on OnePay Advance", () => {
    // A real cycle was overpaid by $6.75 (a fee paid out of pocket but
    // never added to what the debt itself owed). debtBalanceAsOf (one
    // continuous sum, floored once at the very end) lets that $6.75
    // credit offset the next advance; applyCarryForward previously
    // floored `carry` at 0 after every window, discarding the credit and
    // inflating every later episode's balance by exactly $6.75.
    const id = "onepay-overpay-regression";
    const debt: Pick<Debt, "id" | "debt_type" | "linked_account_id"> = {
      id,
      debt_type: "advance",
      linked_account_id: null,
    };
    const adjustments: DebtAdjustment[] = [
      {
        id: "m1",
        household_id: "h",
        debt_id: id,
        amount: 225,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-07-02",
        affects_balance: true,
      },
      {
        id: "m2",
        household_id: "h",
        debt_id: id,
        amount: 225,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-07-17",
        affects_balance: true,
      },
    ];
    const transactions: Transaction[] = [
      tx({
        id: "d1",
        amount: 225,
        transaction_date: "2026-07-02",
        description: "Advance: OnePay Advance",
        linked_debt_id: id,
      }),
      // Overpays m1's $225 by $6.75 (a real fee paid out of pocket, never
      // added to what's owed) — not a shortfall, an overpayment.
      tx({
        id: "p1",
        amount: -231.75,
        transaction_date: "2026-07-10",
        description: "Debt payment · OnePay Advance",
        linked_debt_id: id,
      }),
      tx({
        id: "d2",
        amount: 225,
        transaction_date: "2026-07-17",
        description: "Advance: OnePay Advance",
        linked_debt_id: id,
      }),
      // Pays exactly m2's own $225 — if the $6.75 credit from m1 carried
      // through, the debt is now fully settled; if it was floored away,
      // $6.75 stays wrongly "owed."
      tx({
        id: "p2",
        amount: -225,
        transaction_date: "2026-07-20",
        description: "Debt payment · OnePay Advance",
        linked_debt_id: id,
      }),
    ];
    const episodes = computeAdvanceEpisodes(debt, adjustments, transactions);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]).toMatchObject({ markerId: "m1", net: 0, status: "repaid" });
    expect(episodes[1]).toMatchObject({ markerId: "m2", net: 0, status: "repaid" }); // not 6.75
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
      {
        id: "old1",
        household_id: "h",
        debt_id: daveId,
        amount: 40,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-07-17",
        affects_balance: true,
      },
      {
        id: "old2",
        household_id: "h",
        debt_id: daveId,
        amount: 35,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-07-18",
        affects_balance: true,
      },
      {
        id: "current",
        household_id: "h",
        debt_id: daveId,
        amount: 50,
        adjustment_type: "advance",
        description: null,
        adjustment_date: "2026-09-14",
        affects_balance: true,
      },
    ];
    const transactions: Transaction[] = [
      // Pre-anchor activity — none of this should reach the open episode's net.
      tx({
        id: "old-mirror1",
        amount: -40,
        account_id: linkedAccountId,
        transaction_date: "2026-07-17",
      }),
      tx({
        id: "old-mirror2",
        amount: -35,
        account_id: linkedAccountId,
        transaction_date: "2026-07-18",
      }),
      // The current draw's own mirror leg (consumed by its marker as usual).
      tx({
        id: "current-mirror",
        amount: -50,
        account_id: linkedAccountId,
        transaction_date: "2026-09-14",
      }),
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
      {
        id: "snap1",
        account_id: linkedAccountId,
        balance: -55,
        as_of_date: "2026-09-14",
        created_at: "",
      },
    ];

    const naive = computeAdvanceEpisodes(daveLinked, markers, transactions); // no accounts/accountBalances passed
    expect(naive[naive.length - 1].net).toBeGreaterThan(100); // the inflated, wrong number

    const anchored = computeAdvanceEpisodes(
      daveLinked,
      markers,
      transactions,
      [account],
      accountBalances,
    );
    expect(anchored[anchored.length - 1].net).toBeCloseTo(40, 2); // abs(-55 + 15) — matches effectiveDebtBalance
    expect(anchored[anchored.length - 1].status).toBe("open");
    // Earlier (closed) episodes are untouched by the override — still shown for history.
    expect(anchored[0].markerId).toBe("old1");
  });

  it("REGRESSION: a linked debt's pre-link repayments, logged on a DIFFERENT account and never mirrored, are found and counted — Dave ExtraCash's real full history", () => {
    // Real shape pulled live (2026-10-14): the account was only linked
    // 2026-09-11, so every advance/repayment before that was logged the old
    // way — tagged linked_debt_id, but on whichever account was actually
    // used (Checking, etc.), never mirrored onto Dave ExtraCash itself. An
    // account-only sum sees none of this and wrongly treats every old
    // advance as still outstanding (the bug this fix addresses). Also
    // includes a real "Arrears payment" row (2026-09-25, $40) that must be
    // excluded — it only ever moves arrears_paid_to_date, never principal;
    // including it breaks the reconciliation (claims $0 owed instead of the
    // known-correct $40).
    const otherAccountId = "checking-acct";
    const markers: DebtAdjustment[] = [
      {
        id: "m0",
        household_id: "h",
        debt_id: daveId,
        amount: 40,
        adjustment_type: "advance",
        description: "Advance: Dave ExtraCash",
        adjustment_date: "2026-07-17",
        created_at: "2026-08-30 17:46:34+00",
        affects_balance: true,
      },
      {
        id: "m1",
        household_id: "h",
        debt_id: daveId,
        amount: 35,
        adjustment_type: "advance",
        description: "Advance: Dave ExtraCash",
        adjustment_date: "2026-07-18",
        created_at: "2026-08-30 17:46:53+00",
        affects_balance: true,
      },
      {
        id: "m2",
        household_id: "h",
        debt_id: daveId,
        amount: 50,
        adjustment_type: "advance",
        description: "Advance: Dave ExtraCash",
        adjustment_date: "2026-08-20",
        created_at: "2026-08-27 17:09:30+00",
        affects_balance: true,
      },
      {
        id: "m3",
        household_id: "h",
        debt_id: daveId,
        amount: 50,
        adjustment_type: "advance",
        description: "Advance: Dave ExtraCash",
        adjustment_date: "2026-09-04",
        created_at: "2026-09-11 22:32:20+00",
        affects_balance: true,
      },
      {
        id: "m4",
        household_id: "h",
        debt_id: daveId,
        amount: 50,
        adjustment_type: "advance",
        description: "Advance: Dave ExtraCash",
        adjustment_date: "2026-09-04",
        created_at: "2026-09-11 22:32:41+00",
        affects_balance: true,
      },
      {
        id: "fee1",
        household_id: "h",
        debt_id: daveId,
        amount: 5,
        adjustment_type: "other",
        description: "Overdraft Fee",
        adjustment_date: "2026-09-04",
        created_at: "2026-09-11 22:34:09+00",
        affects_balance: true,
      },
      {
        id: "fee2",
        household_id: "h",
        debt_id: daveId,
        amount: 5,
        adjustment_type: "other",
        description: "Overdraft Fee",
        adjustment_date: "2026-09-04",
        created_at: "2026-09-11 22:34:41+00",
        affects_balance: true,
      },
      {
        id: "m5",
        household_id: "h",
        debt_id: daveId,
        amount: 50,
        adjustment_type: "advance",
        description: "Advance: Dave ExtraCash",
        adjustment_date: "2026-09-14",
        created_at: "2026-09-14 21:22:33+00",
        affects_balance: true,
      },
    ];
    const transactions: Transaction[] = [
      // Pre-tracking stray credit, long before any advance — lands in episode 0, irrelevant to the rest.
      tx({
        id: "stray",
        amount: 10,
        account_id: linkedAccountId,
        transaction_date: "2026-06-04",
        cleared_date: "2026-06-04",
      }),
      // Real cross-account repayments — tagged to the debt, logged on Checking, never mirrored (pre-link).
      tx({
        id: "pay-731",
        amount: -75,
        account_id: otherAccountId,
        transaction_date: "2026-07-31",
        cleared_date: "2026-07-31",
        description: "Debt payment · Dave ExtraCash",
        linked_debt_id: daveId,
      }),
      tx({
        id: "pay-827a",
        amount: -25,
        account_id: otherAccountId,
        transaction_date: "2026-08-27",
        cleared_date: "2026-08-27",
        description: "Debt payment · Dave ExtraCash",
        linked_debt_id: daveId,
      }),
      tx({
        id: "pay-827b",
        amount: -25,
        account_id: "checking-acct-2",
        transaction_date: "2026-08-27",
        cleared_date: "2026-08-27",
        description: "Debt payment · Dave ExtraCash",
        linked_debt_id: daveId,
      }),
      tx({
        id: "pay-911",
        amount: -105,
        account_id: otherAccountId,
        transaction_date: "2026-09-11",
        cleared_date: "2026-09-11",
        description: "Debt payment · Dave ExtraCash",
        linked_debt_id: daveId,
      }),
      // A mirrored pair (post-link): tagged real leg on Checking + untagged mirror on Dave ExtraCash — must count once, not twice.
      tx({
        id: "pay-911-real",
        amount: -5,
        account_id: otherAccountId,
        transaction_date: "2026-09-11",
        cleared_date: "2026-09-11",
        description: "Debt payment · Dave ExtraCash",
        linked_debt_id: daveId,
        transfer_group_id: "tg-5",
      }),
      tx({
        id: "pay-911-mirror",
        amount: 5,
        account_id: linkedAccountId,
        transaction_date: "2026-09-11",
        cleared_date: "2026-09-11",
        description: "Debt payment · Dave ExtraCash",
        transfer_group_id: "tg-5",
      }),
      // The current advance's own disbursement + mirror (consumed by its marker).
      tx({
        id: "m5-mirror",
        amount: -50,
        account_id: linkedAccountId,
        transaction_date: "2026-09-14",
        description: "Advance: Dave ExtraCash",
      }),
      tx({
        id: "m5-fee",
        amount: -5,
        account_id: linkedAccountId,
        transaction_date: "2026-09-14",
        description: "Advance Fee",
        linked_debt_id: daveId,
      }),
      // Post-anchor repayment, properly mirrored.
      tx({
        id: "pay-924-real",
        amount: -15,
        account_id: otherAccountId,
        transaction_date: "2026-09-24",
        cleared_date: "2026-09-24",
        description: "Debt payment · Dave ExtraCash",
        linked_debt_id: daveId,
        transfer_group_id: "tg-15",
      }),
      tx({
        id: "pay-924-mirror",
        amount: 15,
        account_id: linkedAccountId,
        transaction_date: "2026-09-24",
        cleared_date: "2026-09-24",
        description: "Debt payment · Dave ExtraCash",
        transfer_group_id: "tg-15",
      }),
      // The real "Arrears payment" — must be excluded, or the math wrongly claims $0 owed.
      tx({
        id: "arrears",
        amount: -40,
        account_id: otherAccountId,
        transaction_date: "2026-09-25",
        cleared_date: null,
        description: "Arrears payment · Dave ExtraCash",
        linked_debt_id: daveId,
      }),
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
      {
        id: "snap1",
        account_id: linkedAccountId,
        balance: -55,
        as_of_date: "2026-09-14",
        created_at: "",
      },
    ];

    const episodes = computeAdvanceEpisodes(
      daveLinked,
      markers,
      transactions,
      [account],
      accountBalances,
    );
    expect(episodes).toHaveLength(7); // pre-tracking bucket, old1, old2, old3, old4a, old4b, current
    for (const ep of episodes.slice(0, -1)) {
      expect(ep.status).toBe("repaid");
    }
    const last = episodes[episodes.length - 1];
    expect(last.status).toBe("open");
    expect(last.net).toBeCloseTo(40, 2); // matches the live anchor-based figure exactly
  });
});
