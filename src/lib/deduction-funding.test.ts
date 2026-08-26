import { describe, expect, it } from "vitest";
import { deductionFundingLabel, pastDueGroup } from "./deduction-funding";

const deductions = [
  { id: "payroll-1", kind: "payroll" as const },
  { id: "hsa-1", kind: "hsa" as const },
  { id: "fsa-1", kind: "fsa" as const },
  { id: "other-1", kind: "other" as const },
  { id: "no-kind" },
];

describe("pastDueGroup (ADR-082)", () => {
  it("groups an ordinary bill/debt as 'other'", () => {
    expect(pastDueGroup({}, deductions)).toBe("other");
    expect(pastDueGroup({ funding_deduction_id: null }, deductions)).toBe("other");
  });

  it("groups a payroll-deduction-funded item under the paycheck bucket", () => {
    expect(pastDueGroup({ funding_deduction_id: "payroll-1" }, deductions)).toBe(
      "paycheck_deduction",
    );
  });

  it("groups HSA- and FSA-funded items together", () => {
    expect(pastDueGroup({ funding_deduction_id: "hsa-1" }, deductions)).toBe("hsa_fsa");
    expect(pastDueGroup({ funding_deduction_id: "fsa-1" }, deductions)).toBe("hsa_fsa");
  });

  it("treats an 'other'-kind deduction as still paycheck-handled", () => {
    expect(pastDueGroup({ funding_deduction_id: "other-1" }, deductions)).toBe(
      "paycheck_deduction",
    );
  });

  it("defaults to the paycheck bucket when the funding deduction has no kind", () => {
    expect(pastDueGroup({ funding_deduction_id: "no-kind" }, deductions)).toBe(
      "paycheck_deduction",
    );
  });

  it("defaults to the paycheck bucket when the funding deduction is missing", () => {
    expect(pastDueGroup({ funding_deduction_id: "deleted" }, deductions)).toBe(
      "paycheck_deduction",
    );
  });

  it("honors a legacy is_paycheck_deduction debt with no funding link", () => {
    expect(pastDueGroup({ is_paycheck_deduction: true }, deductions)).toBe("paycheck_deduction");
  });

  it("prefers the funding link over the legacy flag", () => {
    expect(
      pastDueGroup({ funding_deduction_id: "hsa-1", is_paycheck_deduction: true }, deductions),
    ).toBe("hsa_fsa");
  });
});

describe("deductionFundingLabel (ADR-082)", () => {
  it("returns null when nothing funds the item", () => {
    expect(deductionFundingLabel(null, deductions)).toBeNull();
    expect(deductionFundingLabel(undefined, deductions)).toBeNull();
  });

  it("labels HSA / FSA / payroll funding distinctly", () => {
    expect(deductionFundingLabel("hsa-1", deductions)).toBe("HSA-funded");
    expect(deductionFundingLabel("fsa-1", deductions)).toBe("FSA-funded");
    expect(deductionFundingLabel("payroll-1", deductions)).toBe("Deduction-funded");
    expect(deductionFundingLabel("other-1", deductions)).toBe("Deduction-funded");
  });

  it("returns null when the funding deduction can't be found or has no kind", () => {
    expect(deductionFundingLabel("deleted", deductions)).toBeNull();
    expect(deductionFundingLabel("no-kind", deductions)).toBeNull();
  });
});
