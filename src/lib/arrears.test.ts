import { describe, expect, it, vi } from "vitest";
import { computeArrears, priorCyclesArrears, arrearsPaymentTag } from "./arrears";
import { toPayable } from "./payments";
import type { Bill, Debt } from "./supabase";

const bill = (over: Partial<Bill>): Bill =>
  ({
    id: "b1",
    household_id: "h",
    name: "Power",
    amount: 100,
    billing_cycle: "monthly",
    next_due_date: "2026-01-10",
    cycle_paid_to_date: 0,
    ...over,
  }) as Bill;

const debt = (over: Partial<Debt>): Debt =>
  ({
    id: "d1",
    household_id: "h",
    name: "Invoice",
    minimum_payment: 50,
    remaining_balance: 500,
    billing_cycle: "one_time",
    next_due_date: "2026-01-10",
    ...over,
  }) as Debt;

describe("computeArrears", () => {
  it("is zero when the due date hasn't passed", () => {
    const a = computeArrears(toPayable("bill", bill({})), "2026-01-05");
    expect(a.amountOverdue).toBe(0);
    expect(a.cyclesMissed).toBe(0);
  });

  it("counts each missed monthly cycle", () => {
    const a = computeArrears(toPayable("bill", bill({})), "2026-03-15");
    expect(a.cyclesMissed).toBe(3); // Jan, Feb, Mar
    expect(a.amountOverdue).toBe(300);
    expect(a.oldestMissedDate).toBe("2026-01-10");
  });

  it("nets partial payment off the current cycle only", () => {
    const a = computeArrears(
      toPayable("bill", bill({ cycle_paid_to_date: 40 })),
      "2026-02-15",
    );
    expect(a.amountOverdue).toBe(160); // 60 remaining + 100
  });

  it("adds opening arrears and ignores cycles on or before the as-of date", () => {
    const a = computeArrears(
      toPayable("bill", bill({ opening_arrears: 250, arrears_as_of: "2026-01-31" })),
      "2026-02-15",
    );
    expect(a.cyclesMissed).toBe(1); // Jan skipped by as-of
    expect(a.amountOverdue).toBe(350);
  });

  it("never rolls a one-time invoice past its single due date", () => {
    const a = computeArrears(toPayable("debt", debt({})), "2026-06-01");
    expect(a.cyclesMissed).toBe(1);
    expect(a.amountOverdue).toBe(50);
  });

  it("reports nothing but carry-in for a paid-off debt", () => {
    const a = computeArrears(
      toPayable("debt", debt({ remaining_balance: 0 })),
      "2026-06-01",
    );
    expect(a.amountOverdue).toBe(0);
  });

  /**
   * ADR-057: a bill 3 cycles behind, paid in full via "Total due".
   *
   * Before payment: next_due_date is still stuck at Jan 10 (never advanced —
   * nothing has resolved any of Jan/Feb/Mar). `arrears_as_of` marks Jan and
   * Feb as already reflected in the $200 manual opening_arrears carry-in
   * (per ADR-049, `counts = cursor > asOf` — a cutoff can only suppress a
   * PREFIX of the walk starting from next_due_date, so it's Jan+Feb here,
   * not "the two oldest" in the abstract). Only Mar — the walk's first
   * cycle after that cutoff — is freshly counted: $200 opening + $100 Mar
   * cycle = $300 overdue, cyclesMissed = 1.
   *
   * (Fixed 2026-08-21: this test previously set `arrears_as_of: "2026-01-09"`,
   * which is before Jan's own due date — that suppresses nothing, so Jan,
   * Feb AND Mar all counted separately, i.e. $500, not the $300 this test
   * asserts. Corrected the fixture to `"2026-02-10"` so the scenario the
   * comment describes is the one actually being computed.)
   *
   * After payment: applyClearedPayment($300) would have produced cycle
   * credit $100 (the Mar cycle) + overflow $200 → opening_arrears
   * max(0, 200-200) = 0, arrears_as_of = payment date "2026-04-01". In
   * practice next_due_date only rolls one cycle per payment; this asserts
   * the simplified end state (due date advanced past today) to confirm
   * computeArrears returns 0 cyclesMissed and 0 amountOverdue — not just a
   * reduced dollar figure.
   */
  it("ADR-057: 3 cycles behind, paid via Total due — cyclesMissed drops to 0", () => {
    // State BEFORE payment: bill is at Jan due date, 2 prior cycles (Jan, Feb)
    // covered by opening_arrears, Mar cycle freshly overdue. Viewed on
    // 2026-04-01 (past the Mar 10 due date).
    const before = toPayable(
      "bill",
      bill({
        opening_arrears: 200,        // Jan + Feb, carried in
        arrears_as_of: "2026-02-10", // cycles on/before Feb 10 don't recount
        next_due_date: "2026-01-10",
        cycle_paid_to_date: 0,
      }),
    );
    const arrearsBefore = computeArrears(before, "2026-04-01");
    expect(arrearsBefore.cyclesMissed).toBe(1); // just Mar
    expect(arrearsBefore.amountOverdue).toBe(300); // 200 opening + 100 Mar cycle

    // State AFTER payment: applyClearedPayment($300) would have produced:
    //   cycle credit = $100, overflow = $200
    //   opening_arrears: max(0, 200 - 200) = 0
    //   arrears_as_of: "2026-04-01" (payment date)
    //   next_due_date: advanced one cycle → "2026-02-10"  (then would roll again...)
    //   In practice the bill rolls once per payment; here we simulate the final
    //   settled state: due date advanced past today, no arrears.
    const after = toPayable(
      "bill",
      bill({
        opening_arrears: 0,
        arrears_as_of: "2026-04-01",
        next_due_date: "2026-05-10", // fully rolled forward past today
        cycle_paid_to_date: 0,
      }),
    );
    const arrearsAfter = computeArrears(after, "2026-04-01");
    expect(arrearsAfter.cyclesMissed).toBe(0);
    expect(arrearsAfter.amountOverdue).toBe(0);
  });

  describe("monthly payment_status trust (fixed 2026-08-21)", () => {
    it("does not count the current month's cycle as missed when recently cleared", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
      try {
        const d = debt({
          billing_cycle: "monthly",
          due_day: 10,
          minimum_payment: 75,
          payment_status: "cleared",
          updated_at: "2026-08-15", // cleared this month, after the due day passed
        });
        const a = computeArrears(toPayable("debt", d), "2026-08-20");
        expect(a.cyclesMissed).toBe(0);
        expect(a.amountOverdue).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("still counts a stale cleared flag left over from an earlier month", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
      try {
        const d = debt({
          billing_cycle: "monthly",
          due_day: 10,
          minimum_payment: 75,
          payment_status: "cleared",
          updated_at: "2026-06-01", // stale — cleared 2+ months ago
        });
        const a = computeArrears(toPayable("debt", d), "2026-08-20");
        expect(a.cyclesMissed).toBe(1);
        expect(a.amountOverdue).toBe(75);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("arrears_paid_to_date (ADR-078)", () => {
    it("subtracts from the full raw total, including the current cycle's own remainder", () => {
      // Same 3-cycles-behind scenario as above ($300 raw: current Jan cycle
      // $100 + Feb + Mar $100 each). A $50 arrears payment should leave $250,
      // not $150 — the bug Lovable QA found when this was still routed
      // through opening_arrears/arrears_as_of (ADR-076's original mistake).
      const a = computeArrears(
        toPayable("bill", bill({ arrears_paid_to_date: 50 })),
        "2026-03-15",
      );
      expect(a.amountOverdue).toBe(250);
      expect(a.cyclesMissed).toBe(3); // raw cycle count is unreduced by design
    });

    it("keeps working correctly across a normal cycle resolve without any reset", () => {
      // Proves ADR-078's "no reset needed" conclusion: a normal resolve (no
      // overflow) never touches arrears_paid_to_date, and the raw walk
      // shrinks on its own as next_due_date rolls forward — the two stay
      // consistent without any special-casing.
      const before = computeArrears(
        toPayable("bill", bill({ arrears_paid_to_date: 50 })),
        "2026-03-15",
      );
      expect(before.amountOverdue).toBe(250); // 300 - 50

      // The CURRENT (Jan) cycle resolves normally — no overflow, so
      // arrears_paid_to_date is untouched — next_due_date rolls to Feb.
      const after = computeArrears(
        toPayable(
          "bill",
          bill({ next_due_date: "2026-02-10", cycle_paid_to_date: 0, arrears_paid_to_date: 50 }),
        ),
        "2026-03-15",
      );
      // Raw total shrinks to $200 (Feb current + Mar), minus the same $50.
      expect(after.amountOverdue).toBe(150);
    });

    it("floors at 0 when arrears_paid_to_date covers or exceeds the raw total", () => {
      const a = computeArrears(
        toPayable("bill", bill({ arrears_paid_to_date: 500 })),
        "2026-03-15",
      );
      expect(a.amountOverdue).toBe(0);
    });

    it("reduces the paid-off-debt carry-in figure too", () => {
      const a = computeArrears(
        toPayable(
          "debt",
          debt({ remaining_balance: 0, opening_arrears: 100, arrears_paid_to_date: 40 }),
        ),
        "2026-06-01",
      );
      expect(a.amountOverdue).toBe(60);
    });
  });
});

describe("priorCyclesArrears (ADR-076)", () => {
  it("excludes the current cycle's own remaining balance, leaving only genuinely separate missed cycles", () => {
    // Jan (current cycle, $100) + Feb (one further missed cycle, $100) = $200
    // total overdue; Submit/Clear can only ever credit the current (Jan)
    // cycle, so priorCyclesArrears excludes Jan's own $100, leaving $100.
    const a = priorCyclesArrears(toPayable("bill", bill({})), "2026-02-15");
    expect(a).toBe(100);
  });

  it("equals amountOverdue when nothing is currently missed live (manual carry-in only)", () => {
    const a = priorCyclesArrears(
      toPayable("bill", bill({ opening_arrears: 250, next_due_date: "2026-05-10" })),
      "2026-02-15", // before the due date — nothing live-missed
    );
    expect(a).toBe(250);
  });
});

describe("arrearsPaymentTag (ADR-076)", () => {
  it("always lands one cycle before the current due date, even with live-missed cycles present", () => {
    // The arrears walk starts AT next_due_date, so oldestMissedDate (when
    // set) is always >= the current due date, never before it — confirms
    // the tag doesn't leak that value even when cycles are live-missed.
    const tag = arrearsPaymentTag(
      toPayable("bill", bill({ next_due_date: "2026-02-10", opening_arrears: 100 })),
      "2026-03-15",
    );
    expect(tag).toBe("2026-01-10"); // one month before the current (Feb) due date
  });

  it("falls back to the current cycle's own opening date when nothing is live-missed", () => {
    const tag = arrearsPaymentTag(
      toPayable("bill", bill({ next_due_date: "2026-05-10" })),
      "2026-02-15",
    );
    expect(tag).toBe("2026-04-10"); // one month before the current due date
  });

  /**
   * Fixed 2026-08-21: when the CURRENT cycle is itself overdue the arrears
   * walk's first iteration reports the current due date as oldestMissedDate.
   * Tagging with that put the arrears payment inside the current cycle's own
   * window (deriveCycleInfo keeps `tagged >= dueDate`), so it read as a
   * partial payment of the current cycle and tripped the stranded-payment
   * panel. The tag must always be strictly older than the current due date.
   */
  it("never tags on/after the current due date when the current cycle is itself overdue", () => {
    const payable = toPayable("bill", bill({ next_due_date: "2026-01-10" }));
    const tag = arrearsPaymentTag(payable, "2026-03-15");
    expect(tag).toBe("2025-12-10"); // one cycle before the current due date
    expect(tag! < "2026-01-10").toBe(true);
  });
});

