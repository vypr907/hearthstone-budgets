import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, ReceiptText, Trash2 } from "lucide-react";

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

import { useAccounts, useTransactions } from "@/lib/data-hooks";
import {
  billRemainingOwed,
  isWithinCurrentBillCycle,
  toPayable,
  useLogBillPayment,
  type PaymentLine,
} from "@/lib/payments";
import { priorCyclesArrears } from "@/lib/arrears";
import { todayISO } from "@/lib/snapshot";
import type { Bill } from "@/lib/supabase";

const LINE_TYPES = [
  { value: "fee", label: "Fee" },
  { value: "interest", label: "Interest" },
  { value: "late_fee", label: "Late fee" },
  { value: "processing_fee", label: "Processing fee" },
  { value: "other", label: "Other charge" },
];

type Line = PaymentLine & { key: string };

function newLine(): Line {
  return { key: crypto.randomUUID(), type: "fee", amount: 0, note: "" };
}

/**
 * Issue #57 / bill equivalent of `LogDebtPaymentDialog` (ADR-084). The date
 * drives the behaviour: inside the current cycle it runs like a normal
 * payment; an elapsed-cycle date (a past calendar month, for a monthly bill —
 * ADR-086) only writes the ledger row and leaves the current cycle untouched.
 * ADR-084 addendum: fee/interest lines post their own transactions against
 * the same account and never touch the bill's cycle/status.
 */
export function LogBillPaymentDialog({ bill }: { bill: Bill }) {
  const [open, setOpen] = useState(false);
  const { data: accounts = [] } = useAccounts();
  const { data: transactions = [] } = useTransactions();
  const log = useLogBillPayment();

  const lastAccountId = useMemo(
    () => transactions.find((t) => t.linked_bill_id === bill.id)?.account_id ?? "",
    [transactions, bill.id],
  );

  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"cleared" | "pending">("cleared");
  const [lines, setLines] = useState<Line[]>([]);

  const inCycle = isWithinCurrentBillCycle(bill, date);
  const linesTotal = lines.reduce((s, l) => s + (Math.abs(Number(l.amount)) || 0), 0);

  /** Newest ledger date, used for the out-of-order warning. */
  const mostRecentEntryDate = useMemo(() => {
    const dates = transactions
      .filter((t) => t.linked_bill_id === bill.id)
      .map((t) => t.transaction_date?.slice(0, 10))
      .filter((d): d is string => !!d);
    return dates.length ? dates.reduce((max, d) => (d > max ? d : max)) : null;
  }, [transactions, bill.id]);

  function reset() {
    setDate(todayISO());
    setAccountId(lastAccountId || "");
    setAmount(String(billRemainingOwed(bill) || ""));
    setStatus("cleared");
    setLines([]);
  }

  async function save() {
    const amt = Math.abs(Number(amount)) || 0;
    if (amt <= 0 && linesTotal <= 0) {
      toast.error("Enter an amount or at least one charge");
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
        `This date (${date}) is older than ${bill.name}'s most recent entry (${mostRecentEntryDate}). Backfilling out of order can produce a wrong balance — continue anyway?`,
      )
    ) {
      return;
    }
    try {
      await log.mutateAsync({
        bill,
        accountId,
        amount: amt,
        date,
        status,
        priorArrears: priorCyclesArrears(toPayable("bill", bill)),
        lines: lines.map(({ type, amount: lineAmount, note }) => ({
          type,
          amount: lineAmount,
          note,
        })),
      });
      toast.success(inCycle ? "Payment logged" : "Historical payment logged");
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
        <span>Log a payment to this bill</span>
      </Button>

      <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Log a payment · {bill.name}</DialogTitle>
              <DialogDescription>
                Record a payment, including an older one from a past cycle, with any fees
                charged alongside it.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <Label htmlFor="log-bill-date">Date</Label>
                <Input
                  id="log-bill-date"
                  type="date"
                  className="h-11"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {inCycle
                    ? "Applies to the current cycle — updates cycle progress, status and due date."
                    : "Historical — ledger only. The current cycle is left untouched."}
                </p>
              </div>

              <div>
                <Label htmlFor="log-bill-account">Paid from</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="log-bill-account" className="h-11">
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
                <Label htmlFor="log-bill-amount">Amount</Label>
                <Input
                  id="log-bill-amount"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  className="h-11"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
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
                    account and don't count toward this bill's cycle.
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
                <Label htmlFor="log-bill-status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as "cleared" | "pending")}>
                  <SelectTrigger id="log-bill-status" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cleared">Cleared</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
