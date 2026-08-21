import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CircleDollarSign, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDeleteLinkedTransaction, useTransactions } from "@/lib/data-hooks";
import { deriveCycleInfo } from "@/lib/ledger-state";
import { applyClearedPayment, toPayable } from "@/lib/payments";
import { priorCyclesArrears } from "@/lib/arrears";
import { formatMoney } from "@/lib/format";
import type { Bill, Transaction } from "@/lib/supabase";

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

export type StrandedBillGroup = { bill: Bill; rows: Transaction[]; clearedSum: number };

/**
 * ADR-037 addendum: mirrors findStrandedDebtPayments for bills. A linked
 * transaction can clear in the ledger without crediting bills.cycle_paid_to_date
 * either via the original ADR-037 write-order failure, or (the gap this addendum
 * closes) by editing a linked row's amount/status from the Transactions screen
 * instead of the bill's own Pay actions. Detect the desync so the stray rows can
 * be deleted and the payment redone through Submit / Mark cleared.
 */
export function findStrandedBillPayments(
  bills: Bill[],
  transactions: Transaction[],
  today = todayISO(),
): StrandedBillGroup[] {
  const out: StrandedBillGroup[] = [];
  for (const bill of bills) {
    const info = deriveCycleInfo(toPayable("bill", bill), transactions, today);
    if (info.resolved) continue; // the cycle really did roll forward — healthy
    const cleared = info.transactions.filter((t) => t.status === "cleared");
    if (cleared.length === 0) continue;
    const clearedSum = cleared.reduce((s, t) => s + Math.abs(Number(t.amount ?? 0)), 0);
    if (clearedSum <= 0.005) continue;
    // The tell-tale: the ledger shows more cleared this cycle than the bill's
    // own counter reflects.
    const paidToDate = Number(bill.cycle_paid_to_date ?? 0);
    if (clearedSum - paidToDate <= 0.005) continue;
    // …and the bill hasn't been touched since those rows were written. Once
    // cycle_paid_to_date has been repaired by hand the bill's updated_at moves
    // past the ledger rows, so the payment did land and this is no longer
    // stranded.
    const newestRow = cleared.reduce(
      (max, t) => (String(t.created_at ?? "") > max ? String(t.created_at ?? "") : max),
      "",
    );
    if (bill.updated_at && newestRow && bill.updated_at >= newestRow) continue;
    out.push({ bill, rows: cleared, clearedSum });
  }
  return out;
}

/** Per-bill dismissals survive reloads — "not a problem" should stay answered. */
const DISMISS_KEY = "hearthstone.stranded_bills.dismissed";

function readDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Repair panel: lists stranded bill payments and deletes the stray ledger rows. */
export function StrandedBillRepair({ bills }: { bills: Bill[] }) {
  const { data: transactions = [] } = useTransactions();
  const del = useDeleteLinkedTransaction();
  const qc = useQueryClient();
  // ADR-077: apply the stranded amount to the bill via the same crediting
  // path Submit/Clear uses, leaving the transactions themselves untouched.
  const credit = useMutation({
    mutationFn: async (g: StrandedBillGroup) => {
      const payable = toPayable("bill", g.bill);
      await applyClearedPayment(payable, g.clearedSum, priorCyclesArrears(payable));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  const groups = useMemo(
    () =>
      findStrandedBillPayments(bills, transactions).filter(
        (g) => !dismissed.includes(g.bill.id),
      ),
    [bills, transactions, dismissed],
  );

  const dismissAll = () => {
    const next = [...new Set([...dismissed, ...groups.map((g) => g.bill.id)])];
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — the in-memory dismissal still applies */
    }
  };

  if (groups.length === 0) return null;

  const clearGroup = async (g: StrandedBillGroup) => {
    if (
      !confirm(
        `Delete ${g.rows.length} stranded payment row(s) for ${g.bill.name}? The bill returns to its pre-payment state so you can redo the payment.`,
      )
    )
      return;
    try {
      for (const row of g.rows) await del.mutateAsync(row);
      toast.success(`${g.bill.name}: stranded payments removed — redo the payment`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const creditGroup = async (g: StrandedBillGroup) => {
    if (
      !confirm(
        `Credit ${formatMoney(g.clearedSum)} already cleared for ${g.bill.name} to the bill now? The transaction(s) are left as-is.`,
      )
    )
      return;
    try {
      await credit.mutateAsync(g);
      toast.success(`${g.bill.name}: credited — caught up`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card className="border-amber-500/50">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold">Stranded bill payments found</p>
            <p className="text-xs text-muted-foreground">
              These payments cleared in the ledger but never updated the bill (ADR-037).
              "Credit now" applies them to the bill as-is; "Clean up" deletes the rows so
              you can redo the payment instead (use this if the transaction itself is
              also wrong).
            </p>
          </div>
        </div>
        {groups.map((g) => (
          <div
            key={g.bill.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">
              {g.bill.name}
              <span className="ml-2 text-xs text-muted-foreground">
                {g.rows.length} row{g.rows.length === 1 ? "" : "s"} ·{" "}
                {formatMoney(g.clearedSum)}
              </span>
            </span>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="default"
                size="sm"
                className="h-10"
                disabled={credit.isPending}
                onClick={() => creditGroup(g)}
              >
                <CircleDollarSign className="mr-2 h-4 w-4" /> Credit now
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10"
                disabled={del.isPending}
                onClick={() => clearGroup(g)}
              >
                <Trash2 className="mr-2 h-4 w-4 text-destructive" /> Clean up
              </Button>
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" className="h-9 w-full" onClick={dismissAll}>
          Hide for now
        </Button>
      </CardContent>
    </Card>
  );
}
