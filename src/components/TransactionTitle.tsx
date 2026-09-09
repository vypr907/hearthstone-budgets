import type { Transaction } from "@/lib/supabase";

type TitleSource = Pick<
  Transaction,
  "description" | "institution_id" | "linked_bill_id" | "linked_debt_id" | "transfer_group_id"
>;

/**
 * ADR-053/063: a manual transaction (no linked bill/debt, no fee-style
 * description) titles itself from its place instead of falling back to
 * generic "Transaction" text, once a place is picked. Fee/Bill payment/Debt
 * payment descriptions (written verbatim by src/lib/payments.ts) are left
 * untouched — this only changes the manual/generic case.
 *
 * ADR-098: either leg of a transfer titles itself "<Source> -> <Destination>"
 * instead, regardless of description — a manually-typed description (e.g.
 * "Xfer to Steph") still shows, as the same italic subtitle used for a
 * place's description above. Callers resolve the two account names
 * themselves (they already have the transfer pair in hand) and pass them in;
 * with either name missing, this falls back to the normal rendering below.
 */
export function TransactionTitle({
  transaction,
  placeName,
  transferFromAccount,
  transferToAccount,
}: {
  transaction: TitleSource;
  placeName: string | null | undefined;
  transferFromAccount?: string | null;
  transferToAccount?: string | null;
}) {
  const desc = transaction.description?.trim() || null;

  if (transaction.transfer_group_id && transferFromAccount && transferToAccount) {
    return (
      <>
        {transferFromAccount} → {transferToAccount}
        {desc ? <span className="text-xs italic text-muted-foreground"> · {desc}</span> : null}
      </>
    );
  }

  const isGeneric =
    !transaction.linked_bill_id && !transaction.linked_debt_id && !desc?.startsWith("Fee: ");

  if (isGeneric && transaction.institution_id && placeName) {
    return (
      <>
        {placeName}
        {desc ? <span className="text-xs italic text-muted-foreground"> · {desc}</span> : null}
      </>
    );
  }
  return <>{desc || "Transaction"}</>;
}
