import type { Transaction } from "@/lib/supabase";

type TitleSource = Pick<
  Transaction,
  "description" | "institution_id" | "linked_bill_id" | "linked_debt_id"
>;

/**
 * ADR-053/063: a manual transaction (no linked bill/debt, no fee-style
 * description) titles itself from its place instead of falling back to
 * generic "Transaction" text, once a place is picked. Fee/Bill payment/Debt
 * payment descriptions (written verbatim by src/lib/payments.ts) are left
 * untouched — this only changes the manual/generic case.
 */
export function TransactionTitle({
  transaction,
  placeName,
}: {
  transaction: TitleSource;
  placeName: string | null | undefined;
}) {
  const desc = transaction.description?.trim() || null;
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
