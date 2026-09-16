import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  categoryDomain,
  useAccounts,
  useBills,
  useCategories,
  useDebts,
  useInstitutions,
  useSaveCashBack,
  useSaveSplitTransaction,
  useSaveTransfer,
  useUpsertTransaction,
} from "@/lib/data-hooks";
import { useCurrentMember } from "@/lib/household";
import { categoryVisual } from "@/lib/visual-meta";
import { Switch } from "@/components/ui/switch";
import { PlacePicker } from "@/components/PlacePicker";
import { TagPicker } from "@/components/TagPicker";
import { useSetTransactionTags } from "@/lib/tags";
import {
  SplitLinesEditor,
  emptySplitRow,
  splitRowsTotal,
  NO_SPLIT_CATEGORY,
  type SplitRow,
} from "@/components/SplitLinesEditor";
import { accountLabel } from "@/lib/format";
import { useAddTransactionPreset } from "@/components/AddTransactionPreset";
import { applyClearedPayment, toPayable } from "@/lib/payments";
import { priorCyclesArrears } from "@/lib/arrears";
import { useQueryClient } from "@tanstack/react-query";
import type { Category } from "@/lib/supabase";

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

const NO_CATEGORY = "__none__";
const NO_LINK = "__none__";

/** Entry mode for the Add Transaction dialog. ADR-069 adds "income"; ADR-103 adds "cashback". */
type TxMode = "expense" | "split" | "transfer" | "income" | "cashback";

/** Shared large, icon-based category dropdown (ADR-054 visual pass). */
function CategorySelect({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: Category[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-12 text-base">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CATEGORY} className="py-3 text-base">
          No category
        </SelectItem>
        {categories.map((c) => {
          const v = categoryVisual(c);
          return (
            <SelectItem key={c.id} value={c.id} className="py-3 text-base">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] text-base"
                  style={{ background: `${v.color}22` }}
                >
                  {v.icon}
                </span>
                <span className="font-medium" style={{ color: v.color }}>
                  {c.name}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/**
 * One-tap manual entry. ADR-062: manual entries default to 'pending' and the
 * status stays user-editable; bill/debt payments, income deposits and
 * transfers keep their own status rules.
 */
export function AddTransactionFab() {
  const { open, preset, openWithPreset, close } = useAddTransactionPreset();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const save = useUpsertTransaction();
  const saveSplit = useSaveSplitTransaction();
  const saveTransfer = useSaveTransfer();
  const saveCashBack = useSaveCashBack();
  const setTags = useSetTransactionTags();
  const currentMember = useCurrentMember();
  const qc = useQueryClient();

  /** Current entry mode. */
  const [mode, setMode] = useState<TxMode>("expense");

  // --- Expense / split state ---
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(NO_CATEGORY);
  const [description, setDescription] = useState("");
  const [link, setLink] = useState(NO_LINK);
  /** ADR-062: manual entries start pending; the user can flip to cleared. */
  const [status, setStatus] = useState<"pending" | "cleared">("pending");
  /** Editable entry date, defaulting to today. */
  const [txDate, setTxDate] = useState(todayISO());
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  /** ADR-044: split entries carry per-category lines instead of one category. */
  const [splitRows, setSplitRows] = useState<SplitRow[]>([emptySplitRow()]);
  /** ADR-104: tags for a plain (non-split) expense/income entry. */
  const [tagIds, setTagIds] = useState<string[]>([]);

  // --- Transfer state (ADR-056) ---
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  /** ADR-097: optional extra amount debited only from the from-account. */
  const [transferFee, setTransferFee] = useState("");
  const [transferDescription, setTransferDescription] = useState("");
  /** ADR-064: one optional category for the transfer pair as a whole. */
  const [transferCategoryId, setTransferCategoryId] = useState(NO_CATEGORY);

  // --- Cash Back state (ADR-103) ---
  /** The account the whole register swipe hit — cash back leaves here too. */
  const [cbAccountId, setCbAccountId] = useState("");
  /** Which household member's Cash account the cash back lands in. */
  const [cbCashAccountId, setCbCashAccountId] = useState("");
  const [cbAmount, setCbAmount] = useState("");
  const [cbDescription, setCbDescription] = useState("");
  const [cbMerchantId, setCbMerchantId] = useState<string | null>(null);
  const [cbPurchaseRows, setCbPurchaseRows] = useState<SplitRow[]>([emptySplitRow()]);

  /** ADR-069: expense/split/transfer see spending categories only. */
  const sortedCategories = useMemo(
    () =>
      categories
        .filter((c) => categoryDomain(c) === "spending")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  /** ADR-069: income mode sees income-domain categories only. */
  const incomeCategories = useMemo(
    () =>
      categories
        .filter((c) => categoryDomain(c) === "income")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  /** ADR-103: Cash-type accounts, one per household member. */
  const cashAccounts = useMemo(
    () => accounts.filter((a) => (a.account_type ?? "").trim().toLowerCase() === "cash"),
    [accounts],
  );
  /** Defaults the Cash Back destination to the signed-in member's own wallet. */
  const defaultCashAccountId = useMemo(
    () => cashAccounts.find((a) => a.owner_member_id === currentMember?.id)?.id ?? cashAccounts[0]?.id ?? "",
    [cashAccounts, currentMember?.id],
  );

  const { data: institutions = [] } = useInstitutions();
  /** ADR-053/063: the place this money was spent at. */
  const [merchantId, setMerchantId] = useState<string | null>(null);

  const institutionName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of institutions) m[i.id] = i.name;
    return m;
  }, [institutions]);

  // SCRATCHPAD "Next Steps": seed the account/place from a preset (opened
  // via "Add transaction" on an Account/Institution detail page) once the
  // dialog opens, on top of reset()'s blank defaults.
  useEffect(() => {
    if (!open) return;
    if (preset?.accountId) setAccountId(preset.accountId);
    if (preset?.institutionId) setMerchantId(preset.institutionId);
  }, [open, preset]);

  function reset() {
    setMode("expense");
    setAccountId("");
    setAmount("");
    setCategoryId(NO_CATEGORY);
    setDescription("");
    setMerchantId(null);
    setLink(NO_LINK);
    setStatus("pending");
    setTxDate(todayISO());
    setSplitRows([emptySplitRow()]);
    setTagIds([]);
    setFromAccountId("");
    setToAccountId("");
    setTransferAmount("");
    setTransferFee("");
    setTransferDescription("");
    setTransferCategoryId(NO_CATEGORY);
    setCbAccountId("");
    setCbCashAccountId("");
    setCbAmount("");
    setCbDescription("");
    setCbMerchantId(null);
    setCbPurchaseRows([emptySplitRow()]);
  }

  async function submitTransfer() {
    const n = Number(transferAmount);
    if (!transferAmount || !Number.isFinite(n) || n <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    if (!fromAccountId) {
      toast.error("Pick a from-account");
      return;
    }
    if (!toAccountId) {
      toast.error("Pick a to-account");
      return;
    }
    if (fromAccountId === toAccountId) {
      toast.error("From and to accounts must be different");
      return;
    }
    const fee = Number(transferFee) > 0 ? Number(transferFee) : undefined;
    const fromAccount = accounts.find((a) => a.id === fromAccountId);
    try {
      await saveTransfer.mutateAsync({
        fromAccountId,
        toAccountId,
        amount: n,
        description: transferDescription.trim() || null,
        transferDate: txDate,
        categoryId: transferCategoryId === NO_CATEGORY ? null : transferCategoryId,
        fee,
        feeInstitutionId: fromAccount?.institution_id ?? null,
      });
      toast.success("Transfer recorded");
      reset();
      close();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function submitExpense() {
    if (!accountId) {
      toast.error("Pick an account");
      return;
    }
    const n = Number(amount);
    if (!amount || !Number.isFinite(n) || n === 0) {
      toast.error("Enter an amount");
      return;
    }
    if (mode === "split") {
      const lines = splitRows.filter((r) => Number(r.amount));
      if (lines.length < 2) {
        toast.error("Add at least two split lines");
        return;
      }
      if (Math.abs(splitRowsTotal(lines) - n) > 0.005) {
        toast.error("Split lines must add up to the total amount");
        return;
      }
      try {
        await saveSplit.mutateAsync({
          accountId,
          transactionDate: txDate,
          description: description.trim() || null,
          status,
          lines: lines.map((r) => ({
            categoryId: r.categoryId === NO_SPLIT_CATEGORY ? null : r.categoryId,
            amount: n > 0 ? -Number(r.amount) : Number(r.amount),
            tagIds: r.tagIds,
          })),
          institutionId: merchantId,
        });
        toast.success("Split transaction added");
        reset();
        close();
      } catch (e) {
        toast.error((e as Error).message);
      }
      return;
    }
    const [linkKind, linkId] = link === NO_LINK ? [null, null] : link.split(":");
    const bill = linkKind === "bill" ? bills.find((b) => b.id === linkId) : undefined;
    const debt = linkKind === "debt" ? debts.find((d) => d.id === linkId) : undefined;
    // Matches the official Submit/Clear flow's standardized label — only
    // fills in when the user left the description blank, never overrides
    // text they actually typed.
    const linkedPayment = bill
      ? `Bill payment · ${bill.name}`
      : debt
        ? `Debt payment · ${debt.name}`
        : null;
    try {
      const saved = await save.mutateAsync({
        account_id: accountId,
        amount: n > 0 ? -n : n,
        category_id: categoryId === NO_CATEGORY ? null : categoryId,
        description: description.trim() || linkedPayment,
        status,
        transaction_date: txDate,
        ...(merchantId ? { institution_id: merchantId } : {}),
        ...(bill ? { linked_bill_id: bill.id } : {}),
        ...(debt ? { linked_debt_id: debt.id } : {}),
      });
      if (tagIds.length) {
        await setTags.mutateAsync({ transactionId: saved.id, tagIds });
      }
      if ((bill || debt) && status === "cleared") {
        const payable = bill ? toPayable("bill", bill) : toPayable("debt", debt!);
        await applyClearedPayment(payable, Math.abs(n), priorCyclesArrears(payable), txDate);
        qc.invalidateQueries({ queryKey: ["bills"] });
        qc.invalidateQueries({ queryKey: ["debts"] });
      }
      qc.invalidateQueries({ queryKey: ["latest_balances"] });
      qc.invalidateQueries({ queryKey: ["spending_actuals"] });
      toast.success("Transaction added");
      reset();
      close();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /**
   * ADR-103: a blended register swipe — part purchase, part cash back. Writes
   * a Checking -> Cash transfer pair for the cash-back amount plus one or
   * more categorized purchase rows on the same account, so the purchase
   * counts as spend once and the cash-back leg counts as spend never (it's
   * a transfer, not money leaving the household).
   */
  async function submitCashBack() {
    if (!cbAccountId) {
      toast.error("Pick an account");
      return;
    }
    const cashAccountId = cbCashAccountId || defaultCashAccountId;
    if (!cashAccountId) {
      toast.error("Pick a Cash account");
      return;
    }
    if (cbAccountId === cashAccountId) {
      toast.error("The account and Cash account must be different");
      return;
    }
    const cashAmt = Number(cbAmount);
    if (!cbAmount || !Number.isFinite(cashAmt) || cashAmt <= 0) {
      toast.error("Enter a positive cash back amount");
      return;
    }
    const lines = cbPurchaseRows.filter((r) => Number(r.amount));
    if (lines.length === 0) {
      toast.error("Add at least one purchase line — for a plain cash withdrawal, use Transfer instead");
      return;
    }
    try {
      await saveCashBack.mutateAsync({
        fromAccountId: cbAccountId,
        cashAccountId,
        cashAmount: cashAmt,
        purchaseLines: lines.map((r) => ({
          categoryId: r.categoryId === NO_SPLIT_CATEGORY ? null : r.categoryId,
          amount: Number(r.amount),
        })),
        description: cbDescription.trim() || null,
        institutionId: cbMerchantId,
        date: txDate,
      });
      toast.success("Cash Back entry added");
      reset();
      close();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /**
   * ADR-069: ad-hoc income (side income, reimbursement, refund, gift). Always
   * stored as a positive amount — mode is chosen, never inferred from the sign.
   */
  async function submitIncome() {
    if (!accountId) {
      toast.error("Pick an account");
      return;
    }
    const n = Math.abs(Number(amount));
    if (!amount || !Number.isFinite(n) || n === 0) {
      toast.error("Enter an amount");
      return;
    }
    try {
      const saved = await save.mutateAsync({
        account_id: accountId,
        amount: n,
        category_id: categoryId === NO_CATEGORY ? null : categoryId,
        description: description.trim() || null,
        status,
        transaction_date: txDate,
        ...(merchantId ? { institution_id: merchantId } : {}),
      });
      if (tagIds.length) {
        await setTags.mutateAsync({ transactionId: saved.id, tagIds });
      }
      qc.invalidateQueries({ queryKey: ["latest_balances"] });
      toast.success("Income added");
      reset();
      close();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const isBusy =
    save.isPending || saveSplit.isPending || saveTransfer.isPending || saveCashBack.isPending;

  return (
    <>
      <Button
        aria-label="Add transaction"
        onClick={() => openWithPreset()}
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-40 h-14 w-14 rounded-full shadow-lg"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? openWithPreset() : (close(), reset()))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Mode tabs: Expense | Income | Transfer (ADR-069) */}
            <div className="flex rounded-lg border p-1 gap-1">
              {(
                [
                  ["expense", "Expense"],
                  ["income", "Income"],
                  ["transfer", "Transfer"],
                  ["cashback", "Cash Back"],
                ] as const
              ).map(([m, labelText]) => {
                const active =
                  m === "expense"
                    ? mode === "expense" || mode === "split"
                    : mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setCategoryId(NO_CATEGORY);
                    }}
                    className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {labelText}
                  </button>
                );
              })}
            </div>

            {/* Date applies to every mode. */}
            <div className="space-y-2">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                className="h-12"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
              />
            </div>

            {mode === "transfer" ? (
              /* ---- Transfer fields ---- */
              <>
                <div className="space-y-2">
                  <Label>From account</Label>
                  <Select value={fromAccountId} onValueChange={setFromAccountId}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Pick an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {accountLabel(a, institutionName[a.institution_id ?? ""])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>To account</Label>
                  <Select value={toAccountId} onValueChange={setToAccountId}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Pick an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {accountLabel(a, institutionName[a.institution_id ?? ""])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="xfer-amount">Amount</Label>
                  <Input
                    id="xfer-amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="h-12"
                    placeholder="0.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                  />
                </div>

                {/* ADR-097: optional instant-transfer-style fee, e.g. Venmo. */}
                <div className="space-y-2">
                  <Label htmlFor="xfer-fee">Fee (optional)</Label>
                  <Input
                    id="xfer-fee"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="h-12"
                    placeholder="0.00"
                    value={transferFee}
                    onChange={(e) => setTransferFee(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Charged to the from-account on top of the transfer amount — tracked
                    separately as a fee, so the to-account only receives the amount above.
                  </p>
                </div>

                <p className="text-xs text-muted-foreground">
                  Moves money between your household's own accounts — no place needed,
                  since nothing's being spent.
                </p>

                {/* ADR-064: one category for the whole transfer. */}
                <div className="space-y-2">
                  <Label>Category (optional)</Label>
                  <CategorySelect
                    value={transferCategoryId}
                    onChange={setTransferCategoryId}
                    categories={sortedCategories}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="xfer-desc">Description (optional)</Label>
                  <Input
                    id="xfer-desc"
                    className="h-12"
                    placeholder="e.g. Move to savings"
                    value={transferDescription}
                    onChange={(e) => setTransferDescription(e.target.value)}
                  />
                </div>
              </>
            ) : mode === "cashback" ? (
              /* ---- Cash Back fields (ADR-103) ---- */
              <>
                <div className="space-y-2">
                  <Label>Account</Label>
                  <Select value={cbAccountId} onValueChange={setCbAccountId}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Pick an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {accountLabel(a, institutionName[a.institution_id ?? ""])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The account this swipe hit — the purchase and the cash back both
                    leave from here.
                  </p>
                </div>

                <SplitLinesEditor
                  rows={cbPurchaseRows}
                  categories={sortedCategories}
                  total={splitRowsTotal(cbPurchaseRows)}
                  onChange={setCbPurchaseRows}
                />

                <div className="space-y-2">
                  <Label htmlFor="cb-amount">Cash back amount</Label>
                  <Input
                    id="cb-amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="h-12"
                    placeholder="0.00"
                    value={cbAmount}
                    onChange={(e) => setCbAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Goes to Cash account</Label>
                  <Select
                    value={cbCashAccountId || defaultCashAccountId}
                    onValueChange={setCbCashAccountId}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Pick a Cash account" />
                    </SelectTrigger>
                    <SelectContent>
                      {cashAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {cashAccounts.length === 0 ? (
                    <p className="text-xs text-destructive">
                      No Cash account yet — add one from the Accounts screen first
                      (account type "Cash").
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Not spent yet — just moved to cash. Only counts as spend once you
                    log what you actually bought with it.
                  </p>
                </div>

                <PlacePicker value={cbMerchantId} onChange={setCbMerchantId} />

                <div className="space-y-2">
                  <Label htmlFor="cb-desc">Description (optional)</Label>
                  <Input
                    id="cb-desc"
                    className="h-12"
                    placeholder="e.g. Snacks + cash back at Fred's"
                    value={cbDescription}
                    onChange={(e) => setCbDescription(e.target.value)}
                  />
                </div>
              </>
            ) : (
              /* ---- Expense / Split fields ---- */
              <>
                <div className="space-y-2">
                  <Label>Account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Pick an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {accountLabel(a, institutionName[a.institution_id ?? ""])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tx-amount">
                    {mode === "income" ? "Amount received" : "Amount spent"}
                  </Label>
                  <Input
                    id="tx-amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    className="h-12"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {mode === "income"
                      ? "Money in — side income, a reimbursement, refund or gift."
                      : "Money out. Enter a negative amount for money in."}
                  </p>
                </div>

                {/* ADR-062: default pending, editable here. */}
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex rounded-lg border p-1 gap-1">
                    {(["pending", "cleared"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition-colors ${
                          status === s
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {mode !== "income" ? (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="pr-3">
                      <Label htmlFor="tx-split">Split into multiple categories</Label>
                      <p className="text-xs text-muted-foreground">
                        One entry, several category lines that must add up to the total.
                      </p>
                    </div>
                    <Switch
                      id="tx-split"
                      checked={mode === "split"}
                      onCheckedChange={(v) => setMode(v ? "split" : "expense")}
                    />
                  </div>
                ) : null}

                {mode === "split" ? (
                  <SplitLinesEditor
                    rows={splitRows}
                    categories={sortedCategories}
                    total={Number(amount) || 0}
                    onChange={setSplitRows}
                  />
                ) : (
                  <div className="space-y-2">
                    <Label>Category (optional)</Label>
                    <CategorySelect
                      value={categoryId}
                      onChange={setCategoryId}
                      categories={mode === "income" ? incomeCategories : sortedCategories}
                    />
                    {mode === "income" && incomeCategories.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No income categories yet — add one on the Categories screen.
                      </p>
                    ) : null}
                  </div>
                )}

                {mode !== "split" ? (
                  <div className="space-y-2">
                    <Label>Tags (optional)</Label>
                    <TagPicker tagIds={tagIds} onChange={setTagIds} />
                  </div>
                ) : null}

                {mode !== "split" && mode !== "income" ? (
                  <div className="space-y-2">
                    <Label>Link to bill/debt (optional)</Label>
                    <Select value={link} onValueChange={setLink}>
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_LINK}>Not linked</SelectItem>
                        {bills.map((b) => (
                          <SelectItem key={`bill-${b.id}`} value={`bill:${b.id}`}>
                            🧾 {b.name}
                          </SelectItem>
                        ))}
                        {debts.map((d) => (
                          <SelectItem key={`debt-${d.id}`} value={`debt:${d.id}`}>
                            💳 {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Linked entries count toward that bill or debt's current cycle.
                    </p>
                  </div>
                ) : null}

                {/* ADR-063: Place is its own field now. */}
                <PlacePicker value={merchantId} onChange={setMerchantId} />

                <div className="space-y-2">
                  <Label htmlFor="tx-desc">Description (optional)</Label>
                  <Input
                    id="tx-desc"
                    className="h-12"
                    placeholder="e.g. Lunch with the team"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              className="h-12 w-full"
              disabled={isBusy}
              onClick={
                mode === "transfer"
                  ? submitTransfer
                  : mode === "income"
                    ? submitIncome
                    : mode === "cashback"
                      ? submitCashBack
                      : submitExpense
              }
            >
              {mode === "transfer"
                ? "Save transfer"
                : mode === "income"
                  ? "Save income"
                  : mode === "cashback"
                    ? "Save Cash Back entry"
                    : mode === "split"
                      ? "Save split transaction"
                      : "Save transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
