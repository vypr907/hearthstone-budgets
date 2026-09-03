import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useAccounts, useDebtAdjustments, useTransactions } from "@/lib/data-hooks";
import {
  debtRemainingOwed,
  isPreAdvanceHistoricalPayment,
  isWithinCurrentCycle,
  toPayable,
  useLogDebtPayment,
  type DebtPaymentLine,
} from "@/lib/payments";
import { priorCyclesArrears } from "@/lib/arrears";
import { formatMoney } from "@/lib/format";
import { todayISO } from "@/lib/snapshot";
import type { Debt } from "@/lib/supabase";

const LINE_TYPES = [
  { value: "fee", label: "Fee" },
  { value: "interest", label: "Interest" },
  { value: "late_fee", label: "Late fee" },
  { value: "processing_fee", label: "Processing fee" },
  { value: "other", label: "Other charge" },
];

type Line = DebtPaymentLine & { key: string };

function newLine(): Line {
  return { key: crypto.randomUUID(), type: "fee", amount: 0, note: "" };
}

/**
 * ADR-084: log a payment against a debt — including an old one. The date drives
 * the behaviour: inside the current cycle it runs like a normal payment, before
 * it the payment only touches the balance and the ledger. Fee/interest lines get
 * their own transactions (so the paying account is right) and never move the
 * debt balance.
 */
export function LogDebtPaymentDialog({ debt }: { debt: Debt }) {
  const [open, setOpen] = useState(false);
  const { data: accounts = [] } = useAccounts();
  const { data: transactions = [] } = useTransactions();
  const { data: adjustments = [] } = useDebtAdjustments();
  const log = useLogDebtPayment();

  /** ADR-084 addendum: newest 'advance' adjustment for this debt, if any. */
  const newestAdvanceDate = useMemo(() => {
    const advances = adjustments
      .filter((a) => a.debt_id === debt.id && a.adjustment_type === "advance")
      .map((a) => String(a.adjustment_date).slice(0, 10))
      .sort();
    return advances.length ? advances[advances.length - 1] : null;
  }, [adjustments, debt.id]);

  const lastAccountId = useMemo(
    () => transactions.find((t) => t.linked_debt_id === debt.id)?.account_id ?? "",
    [transactions, debt.id],
  );

  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [status, setStatus] = useState<"cleared" | "pending">("cleared");
  const [lines, setLines] = useState<Line[]>([]);

  const inCycle = isWithinCurrentCycle(debt, date);
  const ledgerOnly = isPreAdvanceHistoricalPayment(debt, date, newestAdvanceDate);

  /** Newest ledger/adjustment date, used for the out-of-order warning. */
  const mostRecentEntryDate = useMemo(() => {
    const dates = transactions
      .filter((t) => t.linked_debt_id === debt.id)
      .map((t) => t.transaction_date?.slice(0, 10))
      .filter((d): d is string => !!d);
    return dates.length ? dates.reduce((max, d) => (d > max ? d : max)) : null;
  }, [transactions, debt.id]);

  function reset() {
    setDate(todayISO());
    setAccountId(lastAccountId || "");
    setPrincipal(String(debtRemainingOwed(debt) || ""));
    setStatus("cleared");
    setLines([]);
  }

  const linesTotal = lines.reduce((s, l) => s + (Math.abs(Number(l.amount)) || 0), 0);
  const total = (Math.abs(Number(principal)) || 0) + linesTotal;

  async function save() {
    const amt = Math.abs(Number(principal)) || 0;
    if (amt <= 0 && linesTotal <= 0) {
      toast.error("Enter a principal amount or at least one charge");
      return;
    }
    if (!accountId) {
      toast.error("Pick the account this was paid from");
      return;
    }
    if (
      mostRecentEntryDate &&
      date < mostRecentEntryDate &&
      !confirm(
        `This date (${date}) is older than ${debt.name}'s most recent entry (${mostRecentEntryDate}). Backfilling out of order can produce a wrong balance — continue anyway?`,
      )
    ) {
      return;
    }
    try {
      await log.mutateAsync({
        debt,
        accountId,
        principal: amt,
        date,
        status,
        lines: lines.map(({ type, amount, note }) => ({ type, amount, note })),
        priorArrears: priorCyclesArrears(toPayable("debt", debt)),
        newestAdvanceDate,
      });
      toast.success(
        ledgerOnly
          ? "Recorded — balance unchanged"
          : inCycle
            ? "Payment logged"
            : "Historical payment logged",
      );
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="mt-2 h-12 w-full justify-start gap-2"
        onClick={(e) => {
          e.stopPropagation();
          reset();
          setOpen(true);
        }}
      >
        <ReceiptText className="h-5 w-5" />
        <span>Log a payment to this debt</span>
      </Button>

      <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Log a payment · {debt.name}</DialogTitle>
              <DialogDescription>
                Record a payment (including an older one) with any fees or interest charged
                alongside it.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <Label htmlFor="log-date">Date</Label>
                <Input
                  id="log-date"
                  type="date"
                  className="h-11"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {ledgerOnly
                    ? "This advance was taken out after this date — recorded for account history only. The current balance and amount due won't change."
                    : inCycle
                      ? "Applies to the current cycle — updates cycle progress, status and due date."
                      : "Historical — balance and ledger only. The current cycle is left untouched."}
                </p>
              </div>

              <div>
                <Label htmlFor="log-account">Paid from</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="log-account" className="h-11">
                    <SelectValue placeholder="Pick an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        {a.id === lastAccountId ? " · last used" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="log-principal">Principal</Label>
                <Input
                  id="log-principal"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  className="h-11"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {ledgerOnly
                    ? "Recorded against the account only — it won't reduce this debt's balance."
                    : "Only this amount reduces the debt balance."}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Fees & interest</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => setLines((l) => [...l, newLine()])}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add line
                  </Button>
                </div>
                {lines.length === 0 ? (
                  <p className="mt-1 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                    No extra charges. Added lines post their own transactions against the same
                    account and don't change the debt balance.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {lines.map((l, i) => (
                      <div key={l.key} className="flex flex-wrap items-center gap-2">
                        <Select
                          value={l.type}
                          onValueChange={(v) =>
                            setLines((prev) =>
                              prev.map((x, xi) => (xi === i ? { ...x, type: v } : x)),
                            )
                          }
                        >
                          <SelectTrigger className="h-10 w-[9.5rem]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LINE_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          placeholder="0.00"
                          className="h-10 w-24"
                          value={l.amount || ""}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x, xi) =>
                                xi === i ? { ...x, amount: Number(e.target.value) } : x,
                              ),
                            )
                          }
                        />
                        <Input
                          placeholder="Note (optional)"
                          className="h-10 min-w-0 flex-1"
                          value={l.note ?? ""}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x, xi) => (xi === i ? { ...x, note: e.target.value } : x)),
                            )
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          aria-label="Remove line"
                          onClick={() => setLines((prev) => prev.filter((_, xi) => xi !== i))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="log-status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as "cleared" | "pending")}>
                  <SelectTrigger id="log-status" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cleared">Cleared</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-sm">
                Total charged to the account:{" "}
                <span className="font-medium tabular-nums">{formatMoney(total)}</span>
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button className="h-11" disabled={log.isPending} onClick={save}>
                Save payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
