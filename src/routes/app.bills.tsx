import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState } from "@/components/EmptyState";
import { SectionLabel } from "@/components/SectionLabel";
import {
  useBills,
  useDeleteBill,
  useUpsertBill,
  useCategories,
  useInstitutions,
  useTransactions,
  useDeleteLinkedTransaction,
  useBillAdjustments,
  useAddBillAdjustment,
  useDeleteBillAdjustment,
} from "@/lib/data-hooks";
import { formatMoney } from "@/lib/format";
import { useHouseholdDeductions } from "@/lib/income-hooks";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ReversePaymentButton } from "@/components/ReversePaymentButton";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Bill, BillingCycle } from "@/lib/supabase";
import { DetailGrid, DetailItem, DetailMoney, DetailText, StatusBadge } from "@/components/detail";
import { ListControls, groupRows } from "@/components/ListControls";
import { PayActions } from "@/components/PayActions";
import { SetAsideAction } from "@/components/SetAsideAction";
import { useCycleState, stateVisual } from "@/lib/ledger-state";
import { Switch } from "@/components/ui/switch";
import { billCycleDue, billRemainingOwed, toPayable } from "@/lib/payments";
import { PastDueBadge } from "@/components/PastDueBadge";
import { PastDueEditor } from "@/components/PastDueEditor";
import { ItemBar, itemColor } from "@/components/viz";
import { ObligationIcon, useInstitutionIndex } from "@/components/ObligationIcon";
import { formatTypeLabel } from "@/lib/visual-meta";
import { InstitutionDialog } from "@/components/InstitutionDialog";
import { format } from "date-fns";
const ADD_INSTITUTION = "__add_institution__";
import {
  CustomCycleFields,
  deriveCustomInterval,
  toIntervalDays,
  type CycleUnit,
} from "@/components/CustomCycleFields";
const CYCLES: BillingCycle[] = [
  "monthly",
  "biweekly",
  "quarterly",
  "bimonthly",
  "annually",
  "custom",
];
/** ADR-058: mirrors ADJUSTMENT_TYPES from app.debts.tsx */
const BILL_ADJUSTMENT_TYPES = [
  "insurance_covered",
  "insurance_discount",
  "late_fee",
  "nsf_fee",
  "other",
];
export const Route = createFileRoute("/app/bills")({
  head: () => ({
    meta: [
      { title: "Bills — Hearthstone" },
      {
        name: "description",
        content:
          "Track upcoming household bills, due dates, amounts, and payment status in Hearthstone.",
      },
      { property: "og:title", content: "Bills — Hearthstone" },
      {
        property: "og:description",
        content:
          "Track upcoming household bills, due dates, amounts, and payment status in Hearthstone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillsPage,
});
function BillsPage() {
  const { data: bills = [], isLoading } = useBills();
  const { data: categories = [] } = useCategories();
  const { data: allInstitutions = [] } = useInstitutions();
  const institutionById = useInstitutionIndex(allInstitutions);
  const [editing, setEditing] = useState<Partial<Bill> | null>(null);
  const [detail, setDetail] = useState<Bill | null>(null);
  const infoOf = useCycleState();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("due");
  const [group, setGroup] = useState("none");
  const [cats, setCats] = useState<string[]>([]);
  const categoryName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.name;
    return m;
  }, [categories]);
  const rows = useMemo(() => {
    let out = bills;
    if (cats.length) {
      out = out.filter((b) =>
        b.category_id ? cats.includes(b.category_id) : cats.includes("none"),
      );
    }
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter((b) => b.name.toLowerCase().includes(t));
    }
    return [...out].sort((a, b) => {
      if (sort === "category")
        return (categoryName[a.category_id ?? ""] ?? "zzz").localeCompare(
          categoryName[b.category_id ?? ""] ?? "zzz",
        );
      if (sort === "cycle") return (a.billing_cycle ?? "").localeCompare(b.billing_cycle ?? "");
      if (sort === "amount") return Number(b.amount || 0) - Number(a.amount || 0);
      return (a.next_due_date ?? "9999-12-31").localeCompare(b.next_due_date ?? "9999-12-31");
    });
  }, [bills, cats, q, sort, categoryName]);
  const groups = useMemo(() => {
    if (group === "none") return [["", rows]] as Array<[string, Bill[]]>;
    return groupRows(rows, (b) => {
      if (group === "category") return categoryName[b.category_id ?? ""] ?? "Uncategorized";
      if (group === "cycle") return b.billing_cycle ?? "No cycle";
      return b.next_due_date ? b.next_due_date.slice(0, 7) : "No due date";
    });
  }, [rows, group, categoryName]);
  return (
    <>
      <AppHeader title="Bills" />
      <div className="space-y-3 p-4">
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add bill
        </Button>
        <ListControls
          query={q}
          onQueryChange={setQ}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "due", label: "Next due date" },
            { value: "category", label: "Category" },
            { value: "cycle", label: "Billing cycle" },
            { value: "amount", label: "Amount" },
          ]}
          group={group}
          onGroupChange={setGroup}
          groupOptions={[
            { value: "category", label: "Category" },
            { value: "due", label: "Due month" },
            { value: "cycle", label: "Billing cycle" },
          ]}
          categories={categories}
          selectedCategories={cats}
          onSelectedCategoriesChange={setCats}
        />
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <Card>
            <CardContent className="p-0">
              <EmptyState>No bills match.</EmptyState>
            </CardContent>
          </Card>
        )}
        <div className="space-y-4">
          {groups.map(([label, items]) => (
            <div key={label || "all"} className="space-y-2">
              {label && (
                <SectionLabel className="px-1 pt-2">{label}</SectionLabel>
              )}
              {items.map((b, i) => {
                const info = infoOf(toPayable("bill", b));
                const stateLabel = stateVisual(info.state).label;
                const due = billCycleDue(b);
                const paid = Number(b.cycle_paid_to_date ?? 0);
                const pct = due > 0 ? Math.min(100, (paid / due) * 100) : 0;
                return (
                  <Card key={b.id} className="cursor-pointer" onClick={() => setDetail(b)}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <ObligationIcon
                          institution={institutionById[b.institution_id ?? ""]}
                          name={`${b.name} ${(b.category_id && categoryName[b.category_id]) || ""}`}
                          fallback="🧾"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{b.name}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {b.next_due_date ? `Due ${b.next_due_date}` : "No due date"}
                            </span>
                            {b.billing_cycle ? <span>· {b.billing_cycle}</span> : null}
                            {b.category_id && categoryName[b.category_id] ? (
                              <span>· {categoryName[b.category_id]}</span>
                            ) : null}
                            {b.is_variable_amount ? <span>· variable</span> : null}
                            <StatusBadge status={info.state} />
                            {/* ADR-049: how far behind, in money. */}
                            <PastDueBadge payable={toPayable("bill", b)} />
                            {info.clearedSum > 0 && info.remaining > 0 ? (
                              <span className="font-medium text-destructive">
                                {formatMoney(info.remaining)} still owed this cycle
                              </span>
                            ) : null}
                            <span className="sr-only">{stateLabel}</span>
                          </div>
                        </div>
                        <p className="shrink-0 text-lg font-extrabold tabular-nums">
                          {formatMoney(Number(b.amount))}
                        </p>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(b);
                          }}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                      {paid > 0 ? (
                        <ItemBar className="mt-2" value={pct} color={itemColor(i)} />
                      ) : null}
                      <PayActions payable={toPayable("bill", b)} className="mt-2" />
                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <SetAsideAction bill={b} compact />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <BillDialog bill={editing} onClose={() => setEditing(null)} />
      <BillDetailDialog
        bill={detail}
        onClose={() => setDetail(null)}
        onEdit={(b) => {
          setDetail(null);
          setEditing(b);
        }}
      />
    </>
  );
}
function BillDetailDialog({
  bill,
  onClose,
  onEdit,
}: {
  bill: Bill | null;
  onClose: () => void;
  onEdit: (bill: Bill) => void;
}) {
  const { data: categories = [] } = useCategories();
  const { data: institutions = [] } = useInstitutions();
  if (!bill) return null;
  const category = categories.find((c) => c.id === bill.category_id);
  const institution = institutions.find((i) => i.id === bill.institution_id);
  // Only surface cycle figures when they add information beyond bills.amount.
  const showCycle = Number(bill.cycle_paid_to_date ?? 0) > 0 || bill.cycle_amount_due != null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bill.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <DetailGrid>
            <DetailItem label="Category" value={category?.name ?? "—"} />
            <DetailItem label="Institution / account" value={institution?.name ?? "—"} />
            <DetailMoney label="Amount" value={bill.amount} />
            <DetailItem label="Next due date" value={bill.next_due_date ?? "—"} />
            <DetailItem label="Billing cycle" value={bill.billing_cycle ?? "—"} />
            <DetailItem
              label="Payment status"
              value={<StatusBadge status={bill.payment_status} />}
            />
            <DetailItem label="Manual or auto" value={bill.manual_or_auto ?? "—"} />
            <DetailItem label="Variable amount" value={bill.is_variable_amount ? "Yes" : "No"} />
            <DetailItem
              label="Active"
              value={bill.is_active === null ? "—" : bill.is_active ? "Yes" : "No"}
            />
            {showCycle ? (
              <>
                <DetailMoney label="Due this cycle" value={billCycleDue(bill)} />
                <DetailMoney label="Paid this cycle" value={Number(bill.cycle_paid_to_date ?? 0)} />
                <DetailMoney label="Remaining owed" value={billRemainingOwed(bill)} />
              </>
            ) : null}
          </DetailGrid>
          <DetailText label="Notes" value={bill.notes} />
          <PayActions payable={toPayable("bill", bill)} />
          <PastDueEditor bill={bill} />
          <SetAsideAction bill={bill} />
          {/* ADR-058: bill adjustments section */}
          <BillAdjustments bill={bill} />
          <RecentBillTransactions bill={bill} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onEdit(bill)} className="h-11">
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Button>
          <Button onClick={onClose} className="h-11">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ADR-058: non-payment changes to a bill's cycle_amount_due (late fees,
 * insurance discounts, etc.). Mirrors DebtAdjustments in app.debts.tsx.
 */
function BillAdjustments({ bill }: { bill: Bill }) {
  const { data: allAdjustments = [] } = useBillAdjustments();
  const adjustments = useMemo(
    () => allAdjustments.filter((a) => a.bill_id === bill.id),
    [allAdjustments, bill.id],
  );
  const add = useAddBillAdjustment();
  const remove = useDeleteBillAdjustment();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("insurance_covered");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [affectsBalance, setAffectsBalance] = useState(true);

  async function save() {
    const value = Number(amount);
    if (!value) {
      toast.error("Enter a non-zero amount");
      return;
    }
    try {
      await add.mutateAsync({
        bill,
        amount: value,
        adjustmentType: type,
        description: description || null,
        adjustmentDate: date,
        affectsBalance,
      });
      toast.success("Adjustment saved");
      setOpen(false);
      setAmount("");
      setDescription("");
      setAffectsBalance(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <SectionLabel>Adjustments</SectionLabel>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      {adjustments.length === 0 ? (
        <p className="mt-1 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          No adjustments yet.
        </p>
      ) : (
        <div className="mt-1 divide-y divide-border/50 rounded-md border">
          {adjustments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {formatTypeLabel(a.adjustment_type ?? "other")}
                  {a.description ? ` · ${a.description}` : ""}
                  {a.affects_balance === false
                    ? <span className="ml-1 text-xs text-muted-foreground">(record only)</span>
                    : null}
                </p>
                <p className="text-xs text-muted-foreground">{a.adjustment_date}</p>
              </div>
              <span className="shrink-0 tabular-nums font-medium">
                {Number(a.amount) > 0 ? "+" : ""}
                {formatMoney(Number(a.amount))}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={async () => {
                  try {
                    await remove.mutateAsync({ adjustment: a, bill });
                    toast.success("Adjustment removed");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Negative reduces what's owed (insurance, discount); positive increases it
                (late or NSF fee).
              </p>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILL_ADJUSTMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="pr-3">
                <Label htmlFor="bill-adj-affects">Affects balance</Label>
                <p className="text-xs text-muted-foreground">
                  {affectsBalance
                    ? "Updates what's owed this cycle immediately."
                    : "Record only — doesn't change what's owed."}
                </p>
              </div>
              <Switch
                id="bill-adj-affects"
                checked={affectsBalance}
                onCheckedChange={setAffectsBalance}
              />
            </div>
          </div>
          <DialogFooter>
            <Button className="h-11 w-full" onClick={save} disabled={add.isPending}>
              Save adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Last 10 ledger rows linked to this bill, newest first (ADR-035). */
function RecentBillTransactions({ bill }: { bill: Bill }) {
  const billId = bill.id;
  const { data: transactions = [] } = useTransactions();
  const del = useDeleteLinkedTransaction();
  const rows = useMemo(
    () =>
      transactions
        .filter((t) => t.linked_bill_id === billId)
        .sort((a, b) => (b.transaction_date ?? "").localeCompare(a.transaction_date ?? ""))
        .slice(0, 10),
    [transactions, billId],
  );
  return (
    <div>
      <SectionLabel>Recent transactions</SectionLabel>
      {rows.length === 0 ? (
        <EmptyState className="mt-1 py-2 text-left">No payments logged yet.</EmptyState>
      ) : (
        <div className="mt-1 divide-y divide-border/50">
          {rows.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {t.transaction_date?.slice(0, 10)}
                {t.description ? ` · ${t.description}` : ""}
              </span>
              <span className="ml-2 shrink-0 text-xs capitalize text-muted-foreground">
                {t.status ?? "—"}
              </span>
              <span className="ml-2 shrink-0 tabular-nums">
                {formatMoney(Number(t.amount ?? 0))}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-1 h-9 w-9 shrink-0"
                aria-label="Delete transaction"
                disabled={del.isPending}
                onClick={() => {
                  if (!confirm("Delete this ledger transaction? The bill row is left as-is."))
                    return;
                  del.mutate(t, {
                    onSuccess: () => toast.success("Transaction deleted"),
                    onError: (e: unknown) => toast.error((e as Error).message),
                  });
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
              <ReversePaymentButton transaction={t} payable={toPayable("bill", bill)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function BillDialog({ bill, onClose }: { bill: Partial<Bill> | null; onClose: () => void }) {
  const upsert = useUpsertBill();
  const del = useDeleteBill();
  const { data: categories = [] } = useCategories();
  const { data: institutions = [] } = useInstitutions();
  const { data: deductions = [] } = useHouseholdDeductions();
  const [fundingDeductionId, setFundingDeductionId] = useState("none");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [categoryId, setCategoryId] = useState("none");
  const [institutionId, setInstitutionId] = useState("none");
  const [manual, setManual] = useState("none");
  const [notes, setNotes] = useState("");
  const [variable, setVariable] = useState(false);
  const [cycleCount, setCycleCount] = useState("");
  const [cycleUnit, setCycleUnit] = useState<CycleUnit>("days");
  const [institutionDialogOpen, setInstitutionDialogOpen] = useState(false);
  // ADR-049: past-due amount carried in from before tracking started.
  const [openingArrears, setOpeningArrears] = useState("");
  const [arrearsAsOf, setArrearsAsOf] = useState("");
  const open = bill !== null;
  const isEdit = !!bill?.id;
  const key = bill?.id ?? "new";
  const [lastKey, setLastKey] = useState<string>("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(bill?.name ?? "");
    setAmount(bill?.amount != null ? String(bill.amount) : "");
    setDueDay(bill?.next_due_date ?? "");
    setCycle((bill?.billing_cycle as BillingCycle) ?? "monthly");
    setCategoryId(bill?.category_id ?? "none");
    setInstitutionId(bill?.institution_id ?? "none");
    setManual(bill?.manual_or_auto ?? "none");
    setNotes(bill?.notes ?? "");
    setVariable(!!bill?.is_variable_amount);
    setOpeningArrears(bill?.opening_arrears != null ? String(bill.opening_arrears) : "");
    setArrearsAsOf(bill?.arrears_as_of ? bill.arrears_as_of.slice(0, 10) : "");
    setFundingDeductionId(bill?.funding_deduction_id ?? "none");
    const derived = deriveCustomInterval(bill?.cycle_interval_days);
    setCycleCount(derived.count);
    setCycleUnit(derived.unit);
  }
  if (!open && lastKey !== "") setLastKey("");
  async function save() {
    if (!name.trim() || !amount) {
      toast.error("Name and amount are required");
      return;
    }
    const intervalDays = cycle === "custom" ? toIntervalDays(cycleCount, cycleUnit) : null;
    if (cycle === "custom" && !intervalDays) {
      toast.error("Enter how often this custom bill repeats");
      return;
    }
    // ADR-068: a reporting-only deduction posts no transaction, so it can't
    // fund a bill — block the save rather than writing a dead link.
    if (fundingDeductionId !== "none") {
      const funder = deductions.find((d) => d.id === fundingDeductionId);
      if (!funder?.destination_account_id) {
        toast.error(
          "That deduction is reporting-only — pick one with a destination account to fund this bill.",
        );
        return;
      }
    }
    try {
      await upsert.mutateAsync({
        id: bill?.id,
        name: name.trim(),
        amount: Number(amount),
        next_due_date: dueDay || null,
        billing_cycle: cycle.trim().toLowerCase() as BillingCycle,
        cycle_interval_days: intervalDays,
        category_id: categoryId === "none" ? null : categoryId,
        institution_id: institutionId === "none" ? null : institutionId,
        manual_or_auto: manual === "none" ? null : manual.trim().toLowerCase(),
        notes: notes || null,
        is_variable_amount: variable,
        opening_arrears: openingArrears ? Number(openingArrears) : 0,
        arrears_as_of: openingArrears && arrearsAsOf ? arrearsAsOf : null,
        funding_deduction_id: fundingDeductionId === "none" ? null : fundingDeductionId,
      });
      toast.success(isEdit ? "Bill updated" : "Bill added");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function handleDelete() {
    if (!bill?.id) return;
    if (!confirm("Delete this bill?")) return;
    try {
      await del.mutateAsync(bill.id);
      toast.success("Bill deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit bill" : "Add bill"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="b-name">Name</Label>
            <Input
              id="b-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="b-amt">{variable ? "Typical amount" : "Amount"}</Label>
              <Input
                id="b-amt"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label htmlFor="b-day">Next due date</Label>
              <Input
                id="b-day"
                type="date"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-3">
              <Label htmlFor="b-variable">Variable amount</Label>
              <p className="text-xs text-muted-foreground">
                Ask what's owed each cycle when marking this bill paid.
              </p>
            </div>
            <Switch id="b-variable" checked={variable} onCheckedChange={setVariable} />
          </div>
          <div>
            <Label>Billing cycle</Label>
            <Select value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CYCLES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {formatTypeLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {cycle === "custom" ? (
            <CustomCycleFields
              count={cycleCount}
              unit={cycleUnit}
              onCountChange={setCycleCount}
              onUnitChange={setCycleUnit}
            />
          ) : null}
          {/* ADR-049: money already past due before Hearthstone tracked this. */}
          <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
            <div className="col-span-2">
              <Label>Past due carried in</Label>
              <p className="text-xs text-muted-foreground">
                Amount already overdue before tracking started. Missed cycles after the
                as-of date are counted automatically.
              </p>
            </div>
            <div>
              <Label>Opening arrears</Label>
              <Input
                type="number"
                step="0.01"
                value={openingArrears}
                onChange={(e) => setOpeningArrears(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>As of</Label>
              <Input
                type="date"
                value={arrearsAsOf}
                onChange={(e) => setArrearsAsOf(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Institution</Label>
            <Select
              value={institutionId}
              onValueChange={(v) => {
                if (v === ADD_INSTITUTION) {
                  setInstitutionDialogOpen(true);
                  return;
                }
                setInstitutionId(v);
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
                <SelectItem value={ADD_INSTITUTION}>+ Add new institution</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* ADR-068: a deduction that lands in an account can auto-pay this bill. */}
          <div>
            <Label>Funded by deduction</Label>
            <Select value={fundingDeductionId} onValueChange={setFundingDeductionId}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not deduction-funded</SelectItem>
                {deductions.map((d) => (
                  <SelectItem
                    key={d.id}
                    value={d.id}
                    disabled={!d.destination_account_id}
                  >
                    {d.name}
                    {d.destination_account_id ? "" : " — reporting only"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              When the paycheck is marked received, this bill's current cycle is paid
              automatically. Reporting-only deductions can't fund a bill.
            </p>
          </div>
          <div>
            <Label>Manual or auto</Label>
            <Select value={manual} onValueChange={setManual}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unset</SelectItem>
                <SelectItem value="manual">manual</SelectItem>
                <SelectItem value="auto">auto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="b-notes">Notes</Label>
            <Textarea id="b-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit ? (
            <Button variant="destructive" onClick={handleDelete} className="h-11">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={upsert.isPending} className="h-11">
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
        {/* Inline institution creation keeps the in-progress bill form intact. */}
        <InstitutionDialog
          institution={institutionDialogOpen ? {} : null}
          onClose={() => setInstitutionDialogOpen(false)}
          onSaved={(id) => setInstitutionId(id)}
        />
      </DialogContent>
    </Dialog>
  );
}
