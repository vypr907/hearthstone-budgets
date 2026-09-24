import type { Account, Transaction } from "./supabase";

/**
 * ADR-089 addendum: `accounts.transfers_count_as_spend` flags an account this
 * household doesn't fully track on its own (e.g. a spouse's personal account
 * whose day-to-day spending isn't logged here yet) — money that lands there
 * should count as spend, not vanish into an internal-transfer wash. Returns
 * the id set `internalTransferIds()` expects as its second argument.
 */
export function opaqueTransferAccountIds(accounts: Account[] = []): Set<string> {
  return new Set(accounts.filter((a) => a.transfers_count_as_spend).map((a) => a.id));
}

/**
 * ADR-089: a transfer (ADR-056) is only "internal" — money moved between the
 * household's own accounts — when BOTH legs exist in the ledger: a negative row
 * and a positive row sharing the same `transfer_group_id`. Internal transfers
 * are never spending.
 *
 * A one-sided transfer leg (no matching counterpart row) means the money truly
 * left the household, so it keeps counting as spend.
 *
 * ADR-089 addendum: when the POSITIVE (receiving) leg's account is in
 * `opaqueAccountIds`, the pair is no longer treated as internal — the negative
 * leg counts as real spend, same as money actually leaving the household.
 * The reverse direction (a negative leg on an opaque account, money coming
 * back) deliberately stays internal/excluded for now — there's no "income"
 * counterpart in this app's spend calculators yet to route it to instead
 * (a separate feature, not built here).
 *
 * @returns the set of `transfer_group_id`s that are internal (two-sided).
 */
export function internalTransferIds(
  transactions: Transaction[] = [],
  opaqueAccountIds: Set<string> = new Set(),
): Set<string> {
  const neg = new Set<string>();
  const pos = new Set<string>();
  const posOnOpaque = new Set<string>();
  for (const t of transactions) {
    const gid = t.transfer_group_id ?? null;
    if (!gid) continue;
    const amount = Number(t.amount || 0);
    if (amount < 0) {
      neg.add(gid);
    } else if (amount > 0) {
      pos.add(gid);
      if (t.account_id && opaqueAccountIds.has(t.account_id)) posOnOpaque.add(gid);
    }
  }
  const out = new Set<string>();
  for (const gid of neg) {
    if (!pos.has(gid)) continue;
    if (posOnOpaque.has(gid)) continue;
    out.add(gid);
  }
  return out;
}

/** True when this row is one leg of a two-sided (internal) transfer. */
export function isInternalTransfer(t: Transaction, internal: Set<string>): boolean {
  const gid = t.transfer_group_id ?? null;
  return !!gid && internal.has(gid);
}

/**
 * ADR-109: the reverse of `internalTransferIds`'s opaque-account carve-out —
 * a two-sided transfer whose NEGATIVE (sending) leg is on an opaque account
 * is money coming back from a flagged personal account into a joint/tracked
 * one. `internalTransferIds` already classifies this pair as internal
 * (excluded from spend); this returns the subset of that set so a caller can
 * additionally recognize the positive leg as income instead of leaving it
 * neutral.
 *
 * @returns the set of `transfer_group_id`s that are a two-sided,
 *   reverse-opaque transfer (subset of `internalTransferIds()`'s result).
 */
export function reverseOpaqueTransferIds(
  transactions: Transaction[] = [],
  opaqueAccountIds: Set<string> = new Set(),
): Set<string> {
  const negOnOpaque = new Set<string>();
  const pos = new Set<string>();
  for (const t of transactions) {
    const gid = t.transfer_group_id ?? null;
    if (!gid) continue;
    const amount = Number(t.amount || 0);
    if (amount < 0) {
      if (t.account_id && opaqueAccountIds.has(t.account_id)) negOnOpaque.add(gid);
    } else if (amount > 0) {
      pos.add(gid);
    }
  }
  const out = new Set<string>();
  for (const gid of negOnOpaque) {
    if (pos.has(gid)) out.add(gid);
  }
  return out;
}
