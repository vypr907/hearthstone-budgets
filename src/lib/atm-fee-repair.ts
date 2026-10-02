import type { Account, Transaction } from "./supabase";
import { ATM_FEE_LINK_MAX_DATE_DIFF_DAYS } from "./atm-fee-link";

/** Generous flat cap — typical ATM fees run $1.50-$5; keeps the heuristic simple. */
const MAX_FEE_AMOUNT = 20;

export type AtmFeeCandidateTransfer = {
  transferGroupId: string;
  fromLeg: Transaction;
  toLeg: Transaction;
  dayDiff: number;
};

export type AtmFeeCandidate = {
  feeTransaction: Transaction;
  /** Sorted closest-date-first. More than one entry = genuine ambiguity
   * (e.g. two withdrawals at the same place on the same day) — the repair
   * screen must let the user pick, never auto-pick the first. */
  candidateTransfers: AtmFeeCandidateTransfer[];
};

/**
 * ADR-110: find standalone, unlinked, placed small expenses that plausibly
 * belong to an unlinked Cash-destination transfer (the ATM-withdrawal shape),
 * for the guided repair screen (`app.fix-atm-fees.tsx`) to confirm/skip.
 * Never auto-applies anything — returns every date-proximate match per fee,
 * not just the closest, because a day with more than one withdrawal at the
 * same place is genuinely ambiguous and must be a user choice.
 */
export function findUnlinkedAtmFeeCandidates(
  transactions: Transaction[],
  accounts: Account[],
): AtmFeeCandidate[] {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const isCash = (id: string | null | undefined) =>
    (accountById.get(id ?? "")?.account_type ?? "").trim().toLowerCase() === "cash";

  // A split_group_id already in use (fee, cash-back purchase, or category
  // split) means that transfer already has something paired to it.
  const pairedGroupIds = new Set(
    transactions.filter((t) => t.split_group_id).map((t) => t.split_group_id as string),
  );

  const legsByGroup = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.transfer_group_id) continue;
    const list = legsByGroup.get(t.transfer_group_id);
    if (list) list.push(t);
    else legsByGroup.set(t.transfer_group_id, [t]);
  }

  const openCashTransfers: { groupId: string; fromLeg: Transaction; toLeg: Transaction }[] = [];
  for (const [groupId, legs] of legsByGroup) {
    if (legs.length !== 2 || pairedGroupIds.has(groupId)) continue;
    const fromLeg = legs.find((l) => Number(l.amount) < 0);
    const toLeg = legs.find((l) => Number(l.amount) >= 0);
    if (!fromLeg || !toLeg || !isCash(toLeg.account_id)) continue;
    openCashTransfers.push({ groupId, fromLeg, toLeg });
  }
  if (openCashTransfers.length === 0) return [];

  const unlinkedFees = transactions.filter(
    (t) =>
      Number(t.amount) < 0 &&
      Math.abs(Number(t.amount)) <= MAX_FEE_AMOUNT &&
      !!t.institution_id &&
      !t.split_group_id &&
      !t.transfer_group_id,
  );

  const out: AtmFeeCandidate[] = [];
  for (const fee of unlinkedFees) {
    const matches = openCashTransfers
      .filter((ct) => ct.fromLeg.account_id === fee.account_id)
      .map((ct) => ({
        transferGroupId: ct.groupId,
        fromLeg: ct.fromLeg,
        toLeg: ct.toLeg,
        dayDiff:
          Math.abs(
            new Date(fee.transaction_date).getTime() -
              new Date(ct.fromLeg.transaction_date).getTime(),
          ) / 86_400_000,
      }))
      .filter((m) => m.dayDiff <= ATM_FEE_LINK_MAX_DATE_DIFF_DAYS)
      .sort((a, b) => a.dayDiff - b.dayDiff);
    if (matches.length > 0) out.push({ feeTransaction: fee, candidateTransfers: matches });
  }
  return out;
}
