import { describe, expect, it } from "vitest";
import { findUnlinkedAtmFeeCandidates } from "./atm-fee-repair";
import type { Account, Transaction } from "./supabase";

const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: crypto.randomUUID(),
    household_id: "h",
    account_id: "checking",
    amount: -1,
    status: "cleared",
    category_id: null,
    linked_bill_id: null,
    linked_debt_id: null,
    linked_goal_id: null,
    description: null,
    transaction_date: "2026-09-30",
    split_group_id: null,
    transfer_group_id: null,
    institution_id: null,
    created_at: "2026-09-30",
    updated_at: "2026-09-30",
    ...over,
  }) as Transaction;

const acct = (over: Partial<Account>): Account =>
  ({
    id: "checking",
    household_id: "h",
    institution_id: null,
    name: "Checking",
    account_type: "checking",
    starting_balance: 0,
    is_spendable: true,
    credit_limit: null,
    notes: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...over,
  }) as Account;

const ACCOUNTS: Account[] = [
  acct({ id: "checking", account_type: "checking" }),
  acct({ id: "cash", account_type: "cash" }),
];

function transfer(groupId: string, date: string, fromId = "checking", toId = "cash") {
  return [
    tx({
      id: `${groupId}-from`,
      account_id: fromId,
      amount: -60,
      transfer_group_id: groupId,
      transaction_date: date,
    }),
    tx({
      id: `${groupId}-to`,
      account_id: toId,
      amount: 60,
      transfer_group_id: groupId,
      transaction_date: date,
    }),
  ];
}

describe("findUnlinkedAtmFeeCandidates (ADR-110)", () => {
  it("matches a single unlinked fee to its unlinked Cash-destination transfer", () => {
    const fee = tx({
      id: "fee-1",
      amount: -3,
      institution_id: "place-1",
      transaction_date: "2026-09-30",
    });
    const transactions = [...transfer("g1", "2026-09-30"), fee];
    const result = findUnlinkedAtmFeeCandidates(transactions, ACCOUNTS);
    expect(result).toHaveLength(1);
    expect(result[0].feeTransaction.id).toBe("fee-1");
    expect(result[0].candidateTransfers).toHaveLength(1);
    expect(result[0].candidateTransfers[0].transferGroupId).toBe("g1");
  });

  it("surfaces every plausible transfer when visited the same place twice in a day", () => {
    const fee = tx({
      id: "fee-1",
      amount: -3,
      institution_id: "place-1",
      transaction_date: "2026-09-30",
    });
    const transactions = [...transfer("g1", "2026-09-30"), ...transfer("g2", "2026-09-30"), fee];
    const result = findUnlinkedAtmFeeCandidates(transactions, ACCOUNTS);
    expect(result).toHaveLength(1);
    expect(result[0].candidateTransfers.map((c) => c.transferGroupId).sort()).toEqual(["g1", "g2"]);
  });

  it("rejects a candidate whose amount is over the fee cap", () => {
    const fee = tx({
      id: "fee-1",
      amount: -45,
      institution_id: "place-1",
      transaction_date: "2026-09-30",
    });
    const transactions = [...transfer("g1", "2026-09-30"), fee];
    expect(findUnlinkedAtmFeeCandidates(transactions, ACCOUNTS)).toHaveLength(0);
  });

  it("excludes a transfer on a different account than the fee", () => {
    const fee = tx({
      id: "fee-1",
      amount: -3,
      institution_id: "place-1",
      account_id: "other-checking",
      transaction_date: "2026-09-30",
    });
    const transactions = [...transfer("g1", "2026-09-30"), fee];
    expect(findUnlinkedAtmFeeCandidates(transactions, ACCOUNTS)).toHaveLength(0);
  });

  it("excludes a fee that is already linked to something", () => {
    const fee = tx({
      id: "fee-1",
      amount: -3,
      institution_id: "place-1",
      split_group_id: "already-linked",
      transaction_date: "2026-09-30",
    });
    const transactions = [...transfer("g1", "2026-09-30"), fee];
    expect(findUnlinkedAtmFeeCandidates(transactions, ACCOUNTS)).toHaveLength(0);
  });

  it("excludes a transfer that already has something paired to it", () => {
    const fee = tx({
      id: "fee-1",
      amount: -3,
      institution_id: "place-1",
      transaction_date: "2026-09-30",
    });
    const alreadyPaired = tx({
      id: "existing-fee",
      amount: -1.5,
      split_group_id: "g1",
      transaction_date: "2026-09-30",
    });
    const transactions = [...transfer("g1", "2026-09-30"), alreadyPaired, fee];
    expect(findUnlinkedAtmFeeCandidates(transactions, ACCOUNTS)).toHaveLength(0);
  });

  it("excludes a transfer whose destination isn't a Cash-type account", () => {
    const fee = tx({
      id: "fee-1",
      amount: -3,
      institution_id: "place-1",
      transaction_date: "2026-09-30",
    });
    const transactions = [...transfer("g1", "2026-09-30", "checking", "checking")].map((t, i) =>
      i === 1 ? { ...t, account_id: "other-checking" } : t,
    ) as Transaction[];
    const result = findUnlinkedAtmFeeCandidates([...transactions, fee], ACCOUNTS);
    expect(result).toHaveLength(0);
  });

  it("excludes a transfer too far in date from the fee", () => {
    const fee = tx({
      id: "fee-1",
      amount: -3,
      institution_id: "place-1",
      transaction_date: "2026-09-30",
    });
    const transactions = [...transfer("g1", "2026-09-20"), fee];
    expect(findUnlinkedAtmFeeCandidates(transactions, ACCOUNTS)).toHaveLength(0);
  });

  it("ignores a fee with no place set", () => {
    const fee = tx({
      id: "fee-1",
      amount: -3,
      institution_id: null,
      transaction_date: "2026-09-30",
    });
    const transactions = [...transfer("g1", "2026-09-30"), fee];
    expect(findUnlinkedAtmFeeCandidates(transactions, ACCOUNTS)).toHaveLength(0);
  });
});
