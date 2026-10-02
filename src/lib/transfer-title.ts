import type { Account, Institution, Transaction } from "./supabase";

export type TransferTitleInfo = {
  from: string;
  to: string;
  /** ADR-110: set only for a Cash-destination transfer with a paired place. */
  atmPlaceName: string | null;
};

const isCashAccount = (a: Account | undefined) =>
  (a?.account_type ?? "").trim().toLowerCase() === "cash";

/**
 * ADR-098: resolve each transfer leg's own "<Source> -> <Destination>" pair.
 * ADR-110: additionally, when the destination is a Cash-type account, look
 * for a row paired to the transfer via `split_group_id === transfer_group_id`
 * (an ADR-097 fee or an ADR-103 Cash Back purchase line) that carries a place,
 * and resolve its name as `atmPlaceName` — `TransactionTitle` renders that
 * instead of the arrow when present. One pass over the full transaction list,
 * keyed by transaction id, shared by every ledger-list caller instead of a
 * per-row `find()`.
 */
export function buildTransferTitleMap(
  transactions: Transaction[],
  accounts: Account[],
  institutions: Institution[],
): Record<string, TransferTitleInfo> {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const institutionById = new Map(institutions.map((i) => [i.id, i]));

  const legsByGroup = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.transfer_group_id) continue;
    const list = legsByGroup.get(t.transfer_group_id);
    if (list) list.push(t);
    else legsByGroup.set(t.transfer_group_id, [t]);
  }

  const result: Record<string, TransferTitleInfo> = {};
  for (const [groupId, legs] of legsByGroup) {
    const from = legs.find((l) => Number(l.amount) < 0);
    const to = legs.find((l) => Number(l.amount) >= 0);
    if (!from || !to) continue;

    const toAccount = to.account_id ? accountById.get(to.account_id) : undefined;
    let atmPlaceName: string | null = null;
    if (isCashAccount(toAccount)) {
      const pairedPlaceRow = transactions.find(
        (t) => t.split_group_id === groupId && t.institution_id,
      );
      atmPlaceName = pairedPlaceRow
        ? (institutionById.get(pairedPlaceRow.institution_id!)?.name ?? null)
        : null;
    }

    const info: TransferTitleInfo = {
      from: accountById.get(from.account_id ?? "")?.name ?? "—",
      to: accountById.get(to.account_id ?? "")?.name ?? "—",
      atmPlaceName,
    };
    for (const l of legs) result[l.id] = info;
  }
  return result;
}
