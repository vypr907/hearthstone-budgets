import { useMemo, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDeleteLinkedTransaction, useTransactions } from "@/lib/data-hooks";
import { deriveCycleInfo } from "@/lib/ledger-state";
import { toPayable } from "@/lib/payments";
import { formatMoney } from "@/lib/format";
import type { Debt, Transaction } from "@/lib/supabase";

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

export type StrandedGroup = { debt: Debt; rows: Transaction[]; clearedSum: number };

/**
 * ADR-037 repair scan: before `debts.cycle_paid_to_date` existed, clearing a debt
 * payment wrote the ledger row but the debt update silently failed. Those cycles
 * show cleared transactions while the debt itself never moved — no cycle credit
 * and no rollover. Detect them so the rows can be deleted and the payment redone.
 */
export function findStrandedDebtPayments(
  debts: Debt[],
  transactions: Transaction[],
  today = todayISO(),
): StrandedGroup[] {
  const out: StrandedGroup[] = [];
  for (const debt of debts) {
    // A settled debt can never be stranded.
    if (debt.date_paid_off || Number(debt.remaining_balance ?? 0) <= 0.005) continue;
    const info = deriveCycleInfo(toPayable("debt", debt), transactions, today);
    if (info.resolved) continue; // the cycle really did roll forward — healthy
    const cleared = info.transactions.filter((t) => t.status === "cleared");
    if (cleared.length === 0) continue;
    const clearedSum = cleared.reduce((s, t) => s + Math.abs(Number(t.amount ?? 0)), 0);
    if (clearedSum <= 0.005) continue;
    // The tell-tale: money cleared against this cycle, but the debt row shows
    // nothing credited to the cycle.
    if (Number(debt.cycle_paid_to_date ?? 0) > 0.005) continue;
    // …and the debt hasn't been touched since those rows were written. Once the
    // balance has been repaired by hand the debt's updated_at moves past the
    // ledger rows, so the payment did land and this is no longer stranded.
    const newestRow = cleared.reduce(
      (max, t) => (String(t.created_at ?? "") > max ? String(t.created_at ?? "") : max),
      "",
    );
    if (debt.updated_at && newestRow && debt.updated_at >= newestRow) continue;
    // ADR-051: the balance itself is the strongest signal. If the debt has
    // already come down from its starting balance, at least one payment landed
    // — a repaired-by-hand or redone payment must stop being flagged even when
    // the cycle bookkeeping columns were never written. (Previously this
    // required start - remaining >= paidEver, which double-counted old stranded
    // rows alongside a redone payment and kept flagging a fixed debt.)
    const start = Number(debt.starting_balance ?? 0);
    const remaining = Number(debt.remaining_balance ?? 0);
    if (start > 0 && remaining < start - 0.005) continue;
    // Without a starting balance we can't tell whether the money landed; default
    // to not flagging (the user can always re-run a payment) to avoid persistent
    // false positives after a manual balance correction.
    if (start <= 0.005) continue;
    out.push({ debt, rows: cleared, clearedSum });
  }
  return out;
}

/** Per-debt dismissals survive reloads — "not a problem" should stay answered. */
const DISMISS_KEY = "hearthstone.stranded.dismissed";

function readDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Repair panel: lists stranded debt payments and deletes the stray ledger rows. */
export function StrandedDebtRepair({ debts }: { debts: Debt[] }) {
  const { data: transactions = [] } = useTransactions();
  const del = useDeleteLinkedTransaction();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  const groups = useMemo(
    () =>
      findStrandedDebtPayments(debts, transactions).filter(
        (g) => !dismissed.includes(g.debt.id),
      ),
    [debts, transactions, dismissed],
  );

  const dismissAll = () => {
    const next = [...new Set([...dismissed, ...groups.map((g) => g.debt.id)])];
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — the in-memory dismissal still applies */
    }
  };

  if (groups.length === 0) return null;


  const clearGroup = async (g: StrandedGroup) => {
    if (
      !confirm(
        `Delete ${g.rows.length} stranded payment row(s) for ${g.debt.name}? The debt returns to its pre-payment state so you can redo the payment.`,
      )
    )
      return;
    try {
      for (const row of g.rows) await del.mutateAsync(row);
      toast.success(`${g.debt.name}: stranded payments removed — redo the payment`);
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
            <p className="text-sm font-semibold">Stranded debt payments found</p>
            <p className="text-xs text-muted-foreground">
              These payments cleared in the ledger but never updated the debt (the
              pre-fix failure in ADR-037). Delete the rows, then redo each payment
              through Submit / Mark cleared.
            </p>
          </div>
        </div>
        {groups.map((g) => (
          <div
            key={g.debt.id}
            className="flex items-center justify-between gap-2 border-t pt-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">
              {g.debt.name}
              <span className="ml-2 text-xs text-muted-foreground">
                {g.rows.length} row{g.rows.length === 1 ? "" : "s"} ·{" "}
                {formatMoney(g.clearedSum)}
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0"
              disabled={del.isPending}
              onClick={() => clearGroup(g)}
            >
              <Trash2 className="mr-2 h-4 w-4 text-destructive" /> Clean up
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-full"
          onClick={dismissAll}
        >
          Hide for now
        </Button>
      </CardContent>
    </Card>
  );
}
