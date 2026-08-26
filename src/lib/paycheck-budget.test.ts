import { describe, expect, it } from "vitest";
import { projectOccurrences } from "@/lib/paycheck-budget";

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
