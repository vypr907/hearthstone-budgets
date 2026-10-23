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
import { Switch } from "@/components/ui/switch";

import {
  useAccounts,
  useDebtAdjustments,
  useDebts,
  useInstitutions,
  useLogPaymentCoveredByOther,
  useTransactions,
} from "@/lib/data-hooks";
import { ItemizeAmountFields } from "@/components/ItemizeAmountFields";
import {
  composeItemizedDescription,
  debtRemainingOwed,
  draftsFromDefaultLines,
  isPreAdvanceHistoricalPayment,
  isWithinCurrentCycle,
  itemizedAmountTotal,
  LINE_TYPES,
  newPaymentLine,
  toPayable,
  useLogDebtPayment,
  useSaveDefaultFeeLines,
  type ItemizedAmountLine,
  type PaymentLineDraft as Line,
} from "@/lib/payments";
import { priorCyclesArrears } from "@/lib/arrears";
import { computeAdvanceEpisodes } from "@/lib/debt-episodes";
import { formatMoney } from "@/lib/format";
import { todayISO } from "@/lib/snapshot";
import type { Debt } from "@/lib/supabase";

const newLine = newPaymentLine;

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
  const { data: institutions = [] } = useInstitutions();
  const { data: allDebts = [] } = useDebts();
  const log = useLogDebtPayment();
  const logCoveredByOther = useLogPaymentCoveredByOther();
  const saveDefault = useSaveDefaultFeeLines();

  // ADR-113: debts owed to a person (not a business), excluding this debt
  // itself — the only ones this "someone else paid this" picker offers.
  const personDebts = useMemo(
    () =>
      allDebts.filter(
        (d) =>
          d.id !== debt.id &&
          institutions.find((i) => i.id === d.institution_id)?.institution_type === "person",
      ),
    [allDebts, institutions, debt.id],
  );

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

  /** ADR-111 addendum: if the current (still-open) advance episode already
   * has an `advance_fee` adjustment logged (via "Record advance"'s combined
   * Fee field), warn here — that fee is already included in the Principal
   * amount above, so a "Fees & interest" line for the same charge would
   * double-count it. */
  const alreadyLoggedAdvanceFee = useMemo(() => {
    if (debt.debt_type !== "advance") return null;
    const episodes = computeAdvanceEpisodes(debt, adjustments, transactions);
    if (episodes.length === 0) return null;
    const latest = episodes[episodes.length - 1];
    const feeAdj = latest.adjustments.find((a) => a.adjustment_type === "advance_fee");
    return feeAdj ? Number(feeAdj.amount) : null;
  }, [debt, adjustments, transactions]);

  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [status, setStatus] = useState<"cleared" | "pending">("cleared");
  const [lines, setLines] = useState<Line[]>([]);
  const [itemItems, setItemItems] = useState<ItemizedAmountLine[]>([]);
  // ADR-113: "someone else paid this" — a friend/family member fronted the
  // money, which both pays this debt and grows what's owed to them.
  const [coveredByOther, setCoveredByOther] = useState(false);
  const [coveringDebtId, setCoveringDebtId] = useState("");

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
    setLines(draftsFromDefaultLines(debt.default_fee_lines));
    setItemItems([]);
    setCoveredByOther(false);
    setCoveringDebtId("");
  }

  const linesTotal = lines.reduce((s, l) => s + (Math.abs(Number(l.amount)) || 0), 0);
  const principalValue =
    itemItems.length > 0 ? itemizedAmountTotal(itemItems) : Math.abs(Number(principal)) || 0;
  const total = principalValue + linesTotal;

  async function save() {
    const amt = principalValue;
    if (amt <= 0 && linesTotal <= 0) {
      toast.error("Enter a principal amount or at least one charge");
      return;
    }
    if (!accountId) {
      toast.error("Pick the account this was paid from");
      return;
    }
    if (coveredByOther && !coveringDebtId) {
      toast.error('Pick who paid this, or turn off "Someone else paid this"');
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
        principalDescription:
          itemItems.length > 0
            ? composeItemizedDescription(`Debt payment · ${debt.name}`, itemItems)
            : undefined,
        priorArrears: priorCyclesArrears(toPayable("debt", debt)),
        newestAdvanceDate,
      });
      if (coveredByOther) {
        const coveringDebt = personDebts.find((d) => d.id === coveringDebtId);
        if (coveringDebt) {
          await logCoveredByOther.mutateAsync({
            payable: toPayable("debt", debt),
            coveringDebt,
            accountId,
            amount: amt,
            date,
          });
        }
      }
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
                  value={itemItems.length > 0 ? String(principalValue || "") : principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  disabled={itemItems.length > 0}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {ledgerOnly
                    ? "Recorded against the account only — it won't reduce this debt's balance."
                    : "Only this amount reduces the debt balance."}
                </p>
                <div className="mt-2">
                  <ItemizeAmountFields items={itemItems} onChange={setItemItems} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Fees & interest</Label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      disabled={saveDefault.isPending}
                      onClick={() => {
                        const toSave = lines.map(({ type, amount, note }) => ({
                          type,
                          amount,
                          note,
                        }));
                        saveDefault.mutate(
                          { debtId: debt.id, lines: toSave },
                          {
                            onSuccess: () =>
                              toast.success(
                                toSave.some((l) => Math.abs(Number(l.amount)) >= 0.005)
                                  ? "Saved as this debt's default charges"
                                  : "Default charges cleared",
                              ),
                            onError: (e) => toast.error((e as Error).message),
                          },
                        );
                      }}
                    >
                      Save as default
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => setLines((l) => [...l, newLine()])}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add line
                    </Button>
                  </div>
                </div>
                {alreadyLoggedAdvanceFee != null ? (
                  <p className="mt-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                    A {formatMoney(alreadyLoggedAdvanceFee)} advance fee was already logged when
                    this advance was taken — it's already included in the Principal amount above.
                    Only add a line here for a genuinely separate charge (e.g. a late fee), not this
                    same one again.
                  </p>
                ) : null}
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
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as "cleared" | "pending")}
                  disabled={coveredByOther}
                >
                  <SelectTrigger id="log-status" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cleared">Cleared</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <Label htmlFor="log-debt-covered">Someone else paid this</Label>
                  <p className="text-xs text-muted-foreground">
                    A friend or family member paid {debt.name} directly — this applies the payment
                    and adds what you owe them as a debt.
                  </p>
                </div>
                <Switch
                  id="log-debt-covered"
                  checked={coveredByOther}
                  onCheckedChange={(v) => {
                    setCoveredByOther(v);
                    if (v) setStatus("cleared");
                  }}
                />
              </div>

              {coveredByOther ? (
                <div>
                  <Label htmlFor="log-debt-covering-debt">Paid by</Label>
                  <Select value={coveringDebtId} onValueChange={setCoveringDebtId}>
                    <SelectTrigger id="log-debt-covering-debt" className="h-11">
                      <SelectValue placeholder="Pick who covered this" />
                    </SelectTrigger>
                    <SelectContent>
                      {personDebts.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {personDebts.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No person debts yet — add one on the Debts screen (Institution type "Person")
                      first.
                    </p>
                  ) : null}
                </div>
              ) : null}

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
