import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState } from "@/components/EmptyState";
import { SectionLabel } from "@/components/SectionLabel";
import {
  useDebts,
  useDeleteDebt,
  useUpsertDebt,
  useCategories,
  useAccounts,
  useLatestBalances,
  useTransactions,
  useDeleteLinkedTransaction,
  useInstitutions,
  useInstitutionLinks,
  useInstitutionMemberAccounts,
  useDebtAdjustments,
  useAddDebtAdjustment,
  useDeleteDebtAdjustment,
  useCreateAdvance,
  useDeleteAdvance,
  shiftMonth,
} from "@/lib/data-hooks";
import { useHouseholdMembers, memberLabel } from "@/lib/household";
import { effectiveDebtBalance, isDebtPaidOff } from "@/lib/balances";
import { ListControls, groupRows } from "@/components/ListControls";
import { PayActions } from "@/components/PayActions";
import { StrandedDebtRepair } from "@/components/StrandedDebtRepair";
import { CycleMonthStepper } from "@/components/CycleMonthStepper";

import { useCycleState } from "@/lib/ledger-state";
import { hasRecommendation, useRecommendedPayments } from "@/lib/debt-recommended";
import { priorArrearsSummary } from "@/lib/arrears";
import { isAdvanceDisbursement, toPayable, useSyncStoredStatus } from "@/lib/payments";
import { nextPayDate, periodRange } from "@/lib/paycheck-budget";
import { payPeriodForDate } from "@/lib/pay-period";
import { debtPayoffDatePatch } from "@/lib/debt-payoff-state";

import { todayISO } from "@/lib/snapshot";
import {
  DetailGrid,
  DetailItem,
  DetailMoney,
  DetailMoneyStrong,
  DetailText,
  StatusBadge,
  statusVariant,
  CategoryChip,
  ValueChip,
  LogoLabel,
} from "@/components/detail";
import {
  formatMoney,
  debtDueDate,
  accountLabel,
  shiftDateSafe,
  formatWindow,
  monthLabel,
} from "@/lib/format";
import { useHouseholdDeductions, useIncomeSources, useIncomeEvents } from "@/lib/income-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ReversePaymentButton } from "@/components/ReversePaymentButton";
import { CorrectPaymentButton } from "@/components/CorrectPaymentButton";
import { LogDebtPaymentDialog } from "@/components/LogDebtPaymentDialog";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Debt, BillingCycle, Transaction } from "@/lib/supabase";
import { TransactionDetail } from "@/routes/app.transactions";
import { InstitutionDialog } from "@/components/InstitutionDialog";
import { PastDueBadge } from "@/components/PastDueBadge";
import { PastDueEditor } from "@/components/PastDueEditor";


/** ADR-045: invoice joins the existing debt_type values. */
const DEBT_TYPES = ["advance", "credit card", "invoice", "loan", "medical", "other"];
const ADD_INSTITUTION = "__add_institution__";
const ADJUSTMENT_TYPES = [
  "insurance_covered",
  "insurance_discount",
  "late_fee",
  "nsf_fee",
  "other",
];
import { format, parseISO } from "date-fns";
import { ItemBar, itemColor } from "@/components/viz";
import { ObligationIcon, useInstitutionIndex } from "@/components/ObligationIcon";

import { Switch } from "@/components/ui/switch";
import { PAYCHECK_DEDUCTION_ICON, formatTypeLabel, institutionTypeVisual } from "@/lib/visual-meta";
import { InstitutionLogo } from "@/components/InstitutionLogo";
import { InstitutionLoginButton } from "@/components/InstitutionLoginButton";


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
  "semiannually",
  "annually",
  "custom",
  // ADR-048: invoices and other non-recurring charges.
  "one_time",
];


// ADR-105: deep-link to a specific debt's detail dialog from another route
// (e.g. a linked account's "Linked debt" field) — ?open=<debtId>.
type DebtsSearch = { open?: string };

export const Route = createFileRoute("/app/debts")({
  validateSearch: (search: Record<string, unknown>): DebtsSearch => ({
    open: typeof search.open === "string" ? search.open : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Debts — Hearthstone" },
      {
        name: "description",
        content:
          "View and manage your household debts, balances, interest rates, and minimum payments in Hearthstone.",
      },
      { property: "og:title", content: "Debts — Hearthstone" },
      {
        property: "og:description",
        content:
          "View and manage your household debts, balances, interest rates, and minimum payments in Hearthstone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DebtsPage,
});

function DebtsPage() {
  // ADR-102 addendum: `debts` stays raw everywhere in this file -- it feeds
  // every `toPayable("debt", d)` call (PayActions, PastDueBadge, Edit,
  // Correct/Reverse), and several of those mutations still read
  // debt.remaining_balance client-side for a read-then-write (Issue #67). A
  // derived value there would corrupt a linked debt's stored column.
  // `effectiveBalanceById` is a separate, display-only lookup used at each
  // read site below instead of touching `d.remaining_balance` directly.
  const { data: debts = [], isLoading } = useDebts();
  const { data: allInstitutions = [] } = useInstitutions();
  const institutionById = useInstitutionIndex(allInstitutions);
  const { data: allMemberAccounts = [] } = useInstitutionMemberAccounts();
  const { data: members = [] } = useHouseholdMembers();
  /** ADR-106: label for a debt's institution_member_account_id, if set. */
  const memberAccountLabel = (accountId: string | null | undefined) => {
    if (!accountId) return null;
    const acct = allMemberAccounts.find((a) => a.id === accountId);
    return acct ? memberLabel(members.find((m) => m.id === acct.member_id)) : null;
  };
  const { data: balanceAccounts = [] } = useAccounts();
  const { data: latestBalances = {} } = useLatestBalances();
  const { data: balanceTransactions = [] } = useTransactions();
  const effectiveBalanceById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of debts) {
      m[d.id] = effectiveDebtBalance(d, balanceAccounts, latestBalances, balanceTransactions);
    }
    return m;
  }, [debts, balanceAccounts, latestBalances, balanceTransactions]);
  const balanceOf = (d: Debt) => effectiveBalanceById[d.id] ?? Number(d.remaining_balance ?? 0);

  const [editing, setEditing] = useState<Partial<Debt> | null>(null);
  const [detail, setDetail] = useState<Debt | null>(null);
  const search = Route.useSearch();
  const navigate = useNavigate();
  // ADR-105: ?open=<debtId> deep-link — opens that debt's detail and clears
  // the param so back/refresh doesn't keep reopening it.
  useEffect(() => {
    if (!search.open) return;
    const match = debts.find((d) => d.id === search.open);
    if (match) setDetail(match);
    navigate({ to: "/app/debts", search: {}, replace: true });
  }, [search.open, debts, navigate]);
  const infoOf = useCycleState();
  const recommended = useRecommendedPayments();
  const { data: categories = [] } = useCategories();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("priority");
  const [group, setGroup] = useState("none");
  const [cats, setCats] = useState<string[]>([]);
  const [showPaidOff, setShowPaidOff] = useState(false);

  const categoryName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.name;
    return m;
  }, [categories]);

  const isPaidOff = (d: Debt) => isDebtPaidOff(d, balanceOf(d));

  const rows = useMemo(() => {
    let out = debts;
    if (!showPaidOff) out = out.filter((d) => !isPaidOff(d));
    if (cats.length) {
      out = out.filter((d) =>
        d.category_id ? cats.includes(d.category_id) : cats.includes("none"),
      );
    }
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter((d) => d.name.toLowerCase().includes(t));
    }
    return [...out].sort((a, b) => {
      // Paid-off debts always sink to the bottom of the list.
      if (isPaidOff(a) !== isPaidOff(b)) return isPaidOff(a) ? 1 : -1;
      if (sort === "category")
        return (categoryName[a.category_id ?? ""] ?? "zzz").localeCompare(
          categoryName[b.category_id ?? ""] ?? "zzz",
        );
      if (sort === "due")
        return (debtDueDate(a) ?? "9999-12-31").localeCompare(
          debtDueDate(b) ?? "9999-12-31",
        );
      if (sort === "remaining")
        return balanceOf(b) - balanceOf(a);
      return (a.priority_order ?? 9999) - (b.priority_order ?? 9999);
    });
  }, [debts, cats, q, sort, categoryName, showPaidOff, effectiveBalanceById]);

  const flat = useMemo(() => {
    if (group === "none") return rows.map((d) => ({ header: "", d }));
    const grouped = groupRows(rows, (d) => {
      if (group === "category") return categoryName[d.category_id ?? ""] ?? "Uncategorized";
      if (group === "due") return d.due_day ? `Day ${d.due_day}` : "No due day";
      if (group === "remaining")
        return balanceOf(d) > 0 ? "Outstanding" : "Paid off";
      return d.priority_order != null ? `Priority ${d.priority_order}` : "No priority";
    });
    const out: Array<{ header: string; d: Debt }> = [];
    for (const [label, items] of grouped)
      items.forEach((d, i) => out.push({ header: i === 0 ? label : "", d }));
    return out;
  }, [rows, group, categoryName]);

  return (
    <>
      <AppHeader title="Debts" />
      <div className="space-y-3 p-4">
        <StrandedDebtRepair debts={debts} />
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add debt
        </Button>


        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && debts.length === 0 && (
          <Card>
            <CardContent className="p-0">
              <EmptyState>No debts yet.</EmptyState>
            </CardContent>
          </Card>
        )}

        <ListControls
          query={q}
          onQueryChange={setQ}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "priority", label: "Priority order" },
            { value: "due", label: "Due day" },
            { value: "category", label: "Category" },
            { value: "remaining", label: "Remaining balance" },
          ]}
          group={group}
          onGroupChange={setGroup}
          groupOptions={[
            { value: "category", label: "Category" },
            { value: "due", label: "Due day" },
            { value: "priority", label: "Priority order" },
            { value: "remaining", label: "Balance state" },
          ]}
          categories={categories}
          selectedCategories={cats}
          onSelectedCategoriesChange={setCats}
        />

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="pr-3">
            <Label htmlFor="show-paid-off">Show paid off</Label>
            <p className="text-xs text-muted-foreground">
              Include debts with a zero balance, sorted to the bottom.
            </p>
          </div>
          <Switch
            id="show-paid-off"
            checked={showPaidOff}
            onCheckedChange={setShowPaidOff}
          />
        </div>

        <div className="space-y-2">
          {flat.map(({ header, d }, i) => {
            const debtBalance = balanceOf(d);
            const start = Number(d.starting_balance ?? 0) || debtBalance;
            const pctPaid =
              start > 0
                ? Math.min(
                    100,
                    Math.max(0, ((start - debtBalance) / start) * 100),
                  )
                : 0;
            return (
            <div key={d.id} className="space-y-2">
            {header ? (
              <SectionLabel className="px-1 pt-2">{header}</SectionLabel>
            ) : null}
            <Card
              className="cursor-pointer"
              onClick={() => setDetail(d)}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <ObligationIcon
                    institution={institutionById[d.institution_id ?? ""]}
                    name={`${d.name} ${d.debt_type ?? ""}`}
                    fallback="🏦"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.name}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{d.debt_type ? formatTypeLabel(d.debt_type) : "Debt"}</span>
                      {isPaidOff(d) ? (
                        <span>
                          · paid off{d.date_paid_off ? ` ${d.date_paid_off.slice(0, 10)}` : ""}
                        </span>
                      ) : (d.billing_cycle ?? "monthly") === "monthly"
                        ? d.due_day
                          ? <span>· day {d.due_day}</span>
                          : null
                        : d.next_due_date
                          ? <span>· due {d.next_due_date.slice(0, 10)}</span>
                          : null}
                      <span>· {formatTypeLabel(d.billing_cycle ?? "monthly")}</span>
                      {d.is_paycheck_deduction ? (
                        <Badge variant="secondary" title="Paid via paycheck/HSA deduction">
                          {PAYCHECK_DEDUCTION_ICON} Paycheck deduction
                        </Badge>
                      ) : null}
                      {d.interest_rate != null ? (
                        <span>· {Number(d.interest_rate)}% APR</span>
                      ) : null}
                      {memberAccountLabel(d.institution_member_account_id) ? (
                        <span>· {memberAccountLabel(d.institution_member_account_id)}</span>
                      ) : null}
                      <Badge
                        variant={statusVariant(d.payment_status)}
                        className="capitalize"
                      >
                        {d.payment_status || "unpaid"}
                      </Badge>
                      {/* ADR-049: how far behind, in money. */}
                      <PastDueBadge payable={toPayable("debt", d)} />

                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(d);
                    }}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-[12px] bg-muted/50 p-2">
                    <SectionLabel size="sub">Remaining</SectionLabel>
                    <p className="text-xl font-extrabold tabular-nums">
                      {formatMoney(debtBalance)}
                    </p>
                  </div>
                  <div className="rounded-[12px] bg-muted/50 p-2">
                    <SectionLabel size="sub">Min payment</SectionLabel>
                    <p className="text-xl font-extrabold tabular-nums">
                      {formatMoney(Number(d.minimum_payment))}
                    </p>
                        {hasRecommendation(recommended.get(d.id)) ? (
                          <p className="mt-0.5 text-[11px] leading-tight tabular-nums text-muted-foreground">
                            {formatMoney(recommended.get(d.id)!.monthlyMinimum)}/mo min ·{" "}
                            <span className="font-medium text-foreground">
                              {formatMoney(recommended.get(d.id)!.monthlyTarget)}/mo plan
                            </span>
                          </p>
                        ) : null}
                  </div>
                </div>
                {(() => {
                  const info = infoOf(toPayable("debt", d));
                  return info.clearedSum > 0 && info.remaining > 0 ? (
                    <p className="mt-2 text-xs font-medium text-destructive">
                      {formatMoney(info.remaining)} still owed this cycle
                    </p>
                  ) : null;
                })()}
                <ItemBar className="mt-2" value={pctPaid} color={itemColor(i)} />
                <SectionLabel size="sub" className="mt-1">
                  {Math.round(pctPaid)}% paid off
                </SectionLabel>
                <PayActions
                  payable={toPayable("debt", d)}
                  className="mt-2"
                />
              </CardContent>
            </Card>
            </div>
            );
          })}

        </div>
      </div>

      <DebtDialog debt={editing} onClose={() => setEditing(null)} />
      <DebtDetailDialog
        debt={detail}
        onClose={() => setDetail(null)}
        onEdit={(d) => {
          setDetail(null);
          setEditing(d);
        }}
      />
    </>
  );
}

/**
 * The primary-paycheck pay period the debt's due date falls into (ADR-059/060
 * periods), or null when there's no primary source / no covering paycheck.
 */
function payPeriodFor(
  debt: Debt,
  sources: { id: string; is_primary?: boolean | null }[],
  events: Parameters<typeof periodRange>[1],
): { start: string; end: string } | null {
  const due = debtDueDate(debt) ?? (debt.next_due_date ? debt.next_due_date.slice(0, 10) : null);
  return payPeriodForDate(due, sources, events as never);
}

/**
 * The debt's actual billing period: one billing cycle back from its effective
 * due date, up to that due date (e.g. a monthly debt due the 21st → Jul 21 –
 * Aug 21). This is the human-readable cycle; the derivation's counting window
 * can be narrower (it ignores payments that already resolved an older cycle).
 */
function isMonthlyCycle(debt: Debt) {
  return (debt.billing_cycle ?? "monthly").toLowerCase().replace(/[\s_-]/g, "") === "monthly";
}

function billingPeriodFor(debt: Debt): { start: string; end: string } | null {
  const end = debtDueDate(debt) ?? (debt.next_due_date ? debt.next_due_date.slice(0, 10) : null);
  if (!end) return null;
  const start = shiftDateSafe(end, debt.billing_cycle ?? "monthly", -1, debt.cycle_interval_days);
  if (!start || start >= end) return null;
  return { start, end };
}



export function DebtDetailDialog({

  debt,
  onClose,
  onEdit,
}: {
  debt: Debt | null;
  onClose: () => void;
  onEdit?: (debt: Debt) => void;
}) {
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: institutions = [] } = useInstitutions();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: incomeEvents = [] } = useIncomeEvents();
  const { data: latestBalances = {} } = useLatestBalances();
  const { data: balanceTransactions = [] } = useTransactions();
  const { data: allInstitutionLinks = [] } = useInstitutionLinks();
  const recommended = useRecommendedPayments();
  const navigate = useNavigate();
  // ADR-102 addendum: display-only -- `debt` itself stays raw (it feeds
  // toPayable() for every action in this dialog: PayActions, Correct,
  // Reverse). Only this one derived number is used for the "Remaining
  // balance" figure.
  const debtBalance = debt
    ? effectiveDebtBalance(debt, accounts, latestBalances, balanceTransactions)
    : 0;

  // ADR-085 addendum: a month stepper to inspect a prior cycle in place. Only
  // monthly items reconstruct faithfully (calendar-month window); non-monthly
  // windows hang off the mutable next_due_date, so they don't get the stepper.
  const [monthOffset, setMonthOffset] = useState(0);
  useEffect(() => setMonthOffset(0), [debt?.id]);
  const monthly = debt ? isMonthlyCycle(debt) : true;
  const isCurrentView = monthOffset === 0;
  // shiftMonth returns "YYYY-MM-01"; the stepper works in "YYYY-MM".
  const targetMonthKey = shiftMonth(todayISO().slice(0, 7), monthOffset).slice(0, 7);
  const refDate = !isCurrentView && monthly ? `${targetMonthKey}-15` : undefined;
  const infoOf = useCycleState(refDate);

  const category = categories.find((c) => c.id === debt?.category_id);
  const institution = institutions.find((i) => i.id === debt?.institution_id);
  const institutionLinks = institution
    ? allInstitutionLinks.filter((l) => l.institution_id === institution.id)
    : [];
  // ADR-105: prefer the actual linked account (a credit-card debt's real
  // link); fall back to the institution-name match this used before linking
  // existed, for a debt that has no linked_account_id.
  const account = debt?.linked_account_id
    ? accounts.find((a) => a.id === debt.linked_account_id)
    : accounts.find((a) => a.institution_id === debt?.institution_id);

  // ADR-036: the detail panel reports the ledger-derived cycle, not the stored
  // columns — a fully-paid monthly cycle resets cycle_paid_to_date to 0, which
  // otherwise reads as "nothing paid, still owed".
  const cycle = debt ? infoOf(toPayable("debt", debt)) : null;
  const payPeriod = debt ? payPeriodFor(debt, incomeSources, incomeEvents) : null;
  // The billing period itself (one cycle up to the due date) — what a person
  // means by "the cycle", as opposed to the narrower window the derivation
  // happens to count transactions in.
  const billingWindow = debt ? billingPeriodFor(debt) : null;
  const syncStatus = useSyncStoredStatus();
  // Only meaningful for the true current cycle — the stored columns are always
  // "now", never a historical month.
  const storedDiffers =
    isCurrentView && !!debt && !!cycle && (debt.payment_status || "unpaid") !== cycle.state;

  // ADR-049 addendum: prior-month arrears + a "total owed" rollup, shown only in
  // the current view (they're a right-now figure, not a historical one).
  const prior = debt ? priorArrearsSummary(toPayable("debt", debt)) : { amount: 0 };
  const showRollup = isCurrentView && !!cycle && prior.amount > 0.005;
  // A debt can never owe more than its outstanding balance: this cycle's due
  // amount is a slice of that balance, not an addition to it. Cap the rollup so
  // arrears can't double-count what's already inside remaining_balance.
  const totalOwed =
    cycle && debt
      ? debtBalance > 0
        ? Math.min(cycle.remaining + prior.amount, debtBalance)
        : cycle.remaining + prior.amount
      : 0;


  const open = debt !== null;
  if (!debt || !cycle) return null;



  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span className="min-w-0 truncate">{debt.name}</span>
            {institution ? (
              <InstitutionLogo
                logoUrl={institution.logo_url}
                type={institution.institution_type}
                size={32}
              />
            ) : null}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <InstitutionLoginButton institution={institution} links={institutionLinks} />
          {monthly ? (
            <CycleMonthStepper
              monthOffset={monthOffset}
              onChange={setMonthOffset}
              targetMonthKey={targetMonthKey}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Historical cycle view isn't available for non-monthly items.
            </p>
          )}
          <DetailGrid>
            <DetailItem label="Category" value={<CategoryChip category={category} />} />
            <DetailItem label="Debt type" value={debt.debt_type ? formatTypeLabel(debt.debt_type) : "—"} />
            <DetailItem
              label="Account"
              value={
                debt.linked_account_id && account ? (
                  <button
                    type="button"
                    className="underline decoration-dotted underline-offset-2"
                    onClick={() => {
                      onClose();
                      navigate({ to: "/app/accounts", search: { open: account.id } });
                    }}
                  >
                    <LogoLabel
                      name={account.name}
                      logoUrl={institution?.logo_url}
                      type={institution?.institution_type}
                    />
                  </button>
                ) : (
                  <LogoLabel
                    name={account?.name ?? institution?.name}
                    logoUrl={institution?.logo_url}
                    type={institution?.institution_type}
                  />
                )
              }
            />
            <DetailMoney label="Starting balance" value={debt.starting_balance} />
            <DetailMoney
              label="Program start balance"
              value={debt.program_start_balance}
            />
            <DetailMoney label="Remaining balance" value={debtBalance} />
            <DetailMoney label="Minimum payment" value={debt.minimum_payment} />
            {hasRecommendation(recommended.get(debt.id)) ? (
              <DetailItem
                label="Strategy target / mo"
                value={formatMoney(recommended.get(debt.id)!.monthlyTarget)}
              />
            ) : null}
            <DetailMoney label="Paid this cycle" value={cycle.clearedSum} />
            <DetailMoney label="Still owed this cycle" value={cycle.remaining} />
            {showRollup ? (
              <>
                <DetailMoney label="Past due (earlier cycles)" value={prior.amount} />
                <DetailMoneyStrong label="Total owed" value={totalOwed} />
              </>
            ) : null}

            {/* ADR-048: payment-plan shape, only meaningful when one is set. */}
            {debt.plan_payment_count != null ? (
              <DetailItem
                label="Plan payments"
                value={`${debt.plan_payment_count} payment${
                  debt.plan_payment_count === 1 ? "" : "s"
                }`}
              />
            ) : null}
            {debt.plan_final_payment != null ? (
              <DetailMoney label="Final payment" value={debt.plan_final_payment} />
            ) : null}
            {debt.invoice_number ? (
              <DetailItem label="Invoice number" value={debt.invoice_number} />
            ) : null}
            {Number(debt.opening_arrears ?? 0) > 0 ? (
              <DetailMoney label="Opening arrears" value={debt.opening_arrears} />
            ) : null}

            <DetailItem
              label="Interest rate"
              value={
                debt.interest_rate != null ? `${debt.interest_rate}%` : "—"
              }
            />
            <DetailMoney
              label="Known finance charge"
              value={debt.known_finance_charge}
            />
            <DetailItem
              label="Billing cycle"
              value={<ValueChip value={debt.billing_cycle ?? "monthly"} />}
            />
            <DetailItem
              label="Paycheck deduction"
              value={
                debt.is_paycheck_deduction ? (
                  <Badge variant="secondary">
                    {PAYCHECK_DEDUCTION_ICON} Paid via paycheck/HSA
                  </Badge>
                ) : (
                  "No"
                )
              }
            />
            {(debt.billing_cycle ?? "monthly") === "monthly" ? (
              <DetailItem
                label="Due day"
                value={debt.due_day != null ? String(debt.due_day) : "—"}
              />
            ) : (
              <DetailItem
                label="Next due date"
                value={debt.next_due_date ? debt.next_due_date.slice(0, 10) : "—"}
              />
            )}
            <DetailItem
              label="Payment status"
              value={
                <div className="space-y-1">
                  <Badge variant={statusVariant(cycle.state)} className="capitalize">
                    {cycle.state}
                  </Badge>
                  {storedDiffers ? (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        stored: {debt.payment_status || "unpaid"}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={syncStatus.isPending}
                        onClick={() =>
                          syncStatus.mutate({
                            p: toPayable("debt", debt),
                            state: cycle.state,
                            clearedSum: cycle.clearedSum,
                          })
                        }
                      >
                        Sync stored status
                      </Button>
                    </div>
                  ) : null}
                </div>
              }
            />
            <DetailItem
              label="Cycle window"
              value={
                <div>
                  <div>
                    {cycle.windowStart && cycle.windowEnd
                      ? formatWindow(cycle.windowStart, cycle.windowEnd)
                      : formatWindow(billingWindow?.start ?? null, billingWindow?.end ?? null)}
                  </div>
                  {/* ADR-086: monthly cycles are the calendar month, so the
                      counted range is the cycle. Only non-monthly items have a
                      separate billing period worth showing. */}
                  {!isMonthlyCycle(debt) && billingWindow ? (
                    <div className="text-xs text-muted-foreground">
                      billing period {formatWindow(billingWindow.start, billingWindow.end)}
                    </div>
                  ) : null}
                </div>
              }
            />

            <DetailItem label="Pay period" value={payPeriod ? formatWindow(payPeriod.start, payPeriod.end) : "—"} />


            <DetailItem
              label="On payment plan"
              value={
                debt.on_payment_plan === null
                  ? "—"
                  : debt.on_payment_plan
                    ? "Yes"
                    : "No"
              }
            />
            <DetailItem
              label="Manual or auto"
              value={<ValueChip value={debt.manual_or_auto} />}
            />
            <DetailItem
              label="Priority order"
              value={
                debt.priority_order != null ? String(debt.priority_order) : "—"
              }
            />
          </DetailGrid>

          <DetailText label="Notes" value={debt.notes} />
          {isCurrentView ? (
            <PayActions payable={toPayable("debt", debt)} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Submit / Clear apply to the current cycle. To change a payment in{" "}
              {monthLabel(targetMonthKey)}, use its Correct or Reverse action below.
            </p>
          )}
          <LogDebtPaymentDialog debt={debt} />
          <PastDueEditor debt={debt} />

          <RecentDebtTransactions
            debt={debt}
            month={isCurrentView ? undefined : targetMonthKey}
          />

          {debt.linked_account_id && account ? (
            <LinkedAccountActivity
              accountId={account.id}
              month={isCurrentView ? undefined : targetMonthKey}
            />
          ) : null}

          <DebtAdjustments debt={debt} />

          {debt.date_paid_off && (
            <div>
              <p className="text-xs text-muted-foreground">Date paid off</p>
              <p className="mt-1 text-sm">
                {format(parseISO(debt.date_paid_off), "MMM d, yyyy")}
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {onEdit && (
            <Button variant="outline" onClick={() => onEdit(debt)} className="h-11">
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          )}
          <Button onClick={onClose} className="h-11">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




export function DebtDialog({
  debt,
  onClose,
}: {
  debt: Partial<Debt> | null;
  onClose: () => void;
}) {
  const upsert = useUpsertDebt();
  const del = useDeleteDebt();
  const { data: allDebts = [] } = useDebts();
  const { data: transactions = [] } = useTransactions();
  const { data: institutions = [] } = useInstitutions();
  const { data: accounts = [] } = useAccounts();
  const { data: latestBalancesForEdit = {} } = useLatestBalances();
  const { data: deductions = [] } = useHouseholdDeductions();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: incomeEvents = [] } = useIncomeEvents();
  const { data: categories = [] } = useCategories();
  const { data: allMemberAccounts = [] } = useInstitutionMemberAccounts();
  const { data: members = [] } = useHouseholdMembers();
  const [categoryId, setCategoryId] = useState("none");
  const [fundingDeductionId, setFundingDeductionId] = useState("none");
  /** ADR-074: the account this debt is usually paid from. */
  const [usualPaymentAccountId, setUsualPaymentAccountId] = useState("none");
  // ADR-106: which household member's account at the institution this belongs to.
  const [memberAccountId, setMemberAccountId] = useState("none");
  /** ADR-102: the real account this debt's balance actually lives on, if any. */
  const [linkedAccountId, setLinkedAccountId] = useState("none");
  const [name, setName] = useState("");
  const [remaining, setRemaining] = useState("");
  const [original, setOriginal] = useState("");
  const [rate, setRate] = useState("");
  const [minPay, setMinPay] = useState("");
  // Remaining balance and minimum payment mirror Starting balance until edited.
  const [remainingTouched, setRemainingTouched] = useState(false);
  const [minPayTouched, setMinPayTouched] = useState(false);
  const [dueDay, setDueDay] = useState("");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [nextDue, setNextDue] = useState("");
  // ADR-056 addendum: a new advance-type biweekly debt defaults Next due date
  // to the household's next paycheck, once, until the user edits it by hand.
  const [nextDueTouched, setNextDueTouched] = useState(false);
  const [debtType, setDebtType] = useState("");
  const [institutionId, setInstitutionId] = useState("none");
  const [institutionDialogOpen, setInstitutionDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [deduction, setDeduction] = useState(false);
  const [cycleCount, setCycleCount] = useState("");
  const [cycleUnit, setCycleUnit] = useState<CycleUnit>("days");
  // ADR-048: invoice payment plans.
  const [onPlan, setOnPlan] = useState(false);
  const [planCount, setPlanCount] = useState("");
  const [planFinal, setPlanFinal] = useState("");
  // ADR-049: past-due amount carried in from before tracking started.
  const [openingArrears, setOpeningArrears] = useState("");
  const [arrearsAsOf, setArrearsAsOf] = useState("");
  // ADR-052: invoice reference number, which also composes the debt name.
  const [invoiceNumber, setInvoiceNumber] = useState("");
  /** Auto-naming stops the moment the name is typed by hand. */
  const [nameTouched, setNameTouched] = useState(false);

  const isInvoice = debtType === "invoice";
  // ADR-056 addendum (2026-08-27): an advance's remaining_balance and
  // minimum_payment are owned by "Record advance" / payments /
  // advanceMinimumPaymentPatch — this form shows them read-only and never
  // writes them, so a stale 0 in the form can't wipe a live draw.
  const isAdvance = debtType === "advance";
  // ADR-102 addendum: once a debt is linked to a real account,
  // remaining_balance is derived from that account (balances.ts,
  // effectiveDebtBalance) and must never be written back here either --
  // same reasoning as isAdvance above, just a different owner.
  const isLinked = linkedAccountId !== "none";

  const open = debt !== null;
  const isEdit = !!debt?.id;
  const key = debt?.id ?? "new";
  const [lastKey, setLastKey] = useState("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(debt?.name ?? "");
    setRemaining(debt?.remaining_balance != null ? String(debt.remaining_balance) : "");
    setOriginal(debt?.starting_balance != null ? String(debt.starting_balance) : "");
    setRate(debt?.interest_rate != null ? String(debt.interest_rate) : "");
    setMinPay(debt?.minimum_payment != null ? String(debt.minimum_payment) : "");
    setDueDay(debt?.due_day != null ? String(debt.due_day) : "");
    setCycle((debt?.billing_cycle as BillingCycle) ?? "monthly");
    setNextDue(debt?.next_due_date ? debt.next_due_date.slice(0, 10) : "");
    setDebtType(debt?.debt_type ?? "");
    setInstitutionId(debt?.institution_id ?? "none");
    setCategoryId(debt?.category_id ?? "none");
    setNotes(debt?.notes ?? "");
    setDeduction(debt?.is_paycheck_deduction === true);
    setOnPlan(debt?.on_payment_plan === true);
    setPlanCount(debt?.plan_payment_count != null ? String(debt.plan_payment_count) : "");
    setPlanFinal(debt?.plan_final_payment != null ? String(debt.plan_final_payment) : "");
    setOpeningArrears(debt?.opening_arrears != null ? String(debt.opening_arrears) : "");
    setArrearsAsOf(debt?.arrears_as_of ? debt.arrears_as_of.slice(0, 10) : "");
    setInvoiceNumber(debt?.invoice_number ?? "");
    setFundingDeductionId(debt?.funding_deduction_id ?? "none");
    setUsualPaymentAccountId(debt?.usual_payment_account_id ?? "none");
    setMemberAccountId(debt?.institution_member_account_id ?? "none");
    setLinkedAccountId(debt?.linked_account_id ?? "none");
    setNameTouched(!!debt?.name);
    setRemainingTouched(!!debt?.id);
    setMinPayTouched(!!debt?.id);
    setNextDueTouched(!!debt?.id);
    const derived = deriveCustomInterval(debt?.cycle_interval_days);
    setCycleCount(derived.count);
    setCycleUnit(derived.unit);
  }
  if (!open && lastKey !== "") setLastKey("");

  /**
   * ADR-052: an invoice names itself "Institution - INV-1234" while the name
   * is untouched. Typing a name (or opening an existing debt) stops it.
   */
  function autoName(nextInstitutionId: string, nextInvoice: string, type = debtType) {
    if (nameTouched || type !== "invoice") return;
    const inst = institutions.find((i) => i.id === nextInstitutionId)?.name?.trim();
    const num = nextInvoice.trim();
    const composed = [inst, num].filter(Boolean).join(" - ");
    setName(composed);
  }

  /**
   * ADR-056 addendum: an untouched Next due date defaults to the household's
   * next paycheck once the debt is a biweekly advance — still a plain
   * editable field after that, never re-applied once the user touches it.
   */
  function maybeDefaultNextDue(nextType: string, nextCycle: BillingCycle) {
    if (nextDueTouched || nextDue || nextType !== "advance" || nextCycle !== "biweekly") return;
    const due = nextPayDate(incomeSources, incomeEvents, todayISO());
    if (due) setNextDue(due);
  }

  /** Invoices default to a single dated charge unless put on a payment plan. */
  function chooseType(v: string) {
    const next = v === "none" ? "" : v;
    setDebtType(next);
    autoName(institutionId, invoiceNumber, next);
    if (next === "invoice" && !isEdit && cycle === "monthly") setCycle("one_time");
    maybeDefaultNextDue(next, cycle);
  }

  function chooseCycle(v: BillingCycle) {
    setCycle(v);
    maybeDefaultNextDue(debtType, v);
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const intervalDays = cycle === "custom" ? toIntervalDays(cycleCount, cycleUnit) : null;
    if (cycle === "custom" && !intervalDays) {
      toast.error("Enter how often this custom debt repeats");
      return;
    }
    const remainingNum = remaining ? Number(remaining) : null;
    const originalNum = original ? Number(original) : null;
    // The debts table requires starting_balance; fall back to what's owed today
    // so a quick invoice entry never trips the not-null constraint.
    const startingBalance =
      originalNum ?? remainingNum ?? Number(debt?.starting_balance ?? 0) ?? 0;
    // ADR-068: a reporting-only deduction posts no transaction, so it can't
    // fund a debt — block the save rather than writing a dead link.
    if (fundingDeductionId !== "none") {
      const funder = deductions.find((d) => d.id === fundingDeductionId);
      if (!funder?.destination_account_id) {
        toast.error(
          "That deduction is reporting-only — pick one with a destination account to fund this debt.",
        );
        return;
      }
    }
    // A one-time charge has no due day — it has a real date.
    const dated = cycle !== "monthly";
    const nextRemaining = remainingNum ?? originalNum;
    // Keep date_paid_off in sync with a manually-edited balance, the same way
    // applyClearedPayment()/useReversePayment() keep it in sync with a real
    // payment — otherwise this screen's own isPaidOff (remaining_balance <= 0)
    // and obligationsInRange()'s date_paid_off check can silently disagree.
    //
    // Advance carve-out (ADR-056 addendum 2026-08-27):
    //  - advance-type debts: date_paid_off is owned by the payment flow +
    //    advanceReactivationPatch(); this form never stamps or clears it.
    const linkedDates = transactions
      .filter((t) => t.linked_debt_id === debt?.id)
      .map((t) => t.transaction_date)
      .sort();
    const latestLinkedDate = linkedDates[linkedDates.length - 1] ?? todayISO();
    const datePaidOff =
      nextRemaining == null
        ? debt?.date_paid_off ?? null
        : (debtPayoffDatePatch(
            debt ?? { debt_type: debtType, date_paid_off: null },
            nextRemaining,
            latestLinkedDate,
          ).date_paid_off ?? null);
    // ADR-056 addendum: `remaining_balance`, `minimum_payment` and
    // `date_paid_off` on an advance are owned by "Record advance" / payments /
    // advanceMinimumPaymentPatch / advanceReactivationPatch — never this form.
    // On an advance EDIT we omit all three from the update entirely, so a stale
    // debt snapshot (e.g. the detail dialog was opened at $0, a draw recorded,
    // then Edit → Save) cannot clobber a live balance. On a new advance we still
    // have to seed the two NOT NULL columns, at 0.
    // Both columns are NOT NULL in the DB (minimum_payment has no default), so
    // for every other debt type a blank field must land as 0, never null.
    const skipAdvanceLifecycleFields = isAdvance && isEdit;
    // ADR-102 addendum: a linked debt's remaining_balance is derived
    // (balances.ts, effectiveDebtBalance) -- never write it from this form,
    // on a new link or an already-linked edit alike. minimum_payment and
    // date_paid_off are unaffected: a linked credit card still has its own
    // real minimum payment, distinct from the full derived balance.
    const skipRemainingBalanceField = skipAdvanceLifecycleFields || (isLinked && isEdit);
    const remainingToWrite = isAdvance
      ? 0
      : remainingNum ?? originalNum ?? startingBalance ?? 0;
    const minPaymentToWrite = isAdvance ? 0 : minPay ? Number(minPay) : 0;
    // ADR-074: an explicit pick always wins; otherwise fall back to the most
    // recent linked-payment transaction's account, same derivation as the
    // backfill script ran once already.
    let usualPaymentAccountId2: string | null = usualPaymentAccountId !== "none" ? usualPaymentAccountId : null;
    if (!usualPaymentAccountId2) {
      const linked = transactions
        .filter((t) => t.linked_debt_id === debt?.id)
        .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
      usualPaymentAccountId2 = linked[linked.length - 1]?.account_id ?? null;
    }
    try {
      await upsert.mutateAsync({
        id: debt?.id,
        name: name.trim(),
        // ADR-094: a new debt lands at the end of the Custom payoff order.
        // Edits never touch priority_order — the reorder editor owns it.
        ...(!isEdit
          ? {
              priority_order:
                Math.max(0, ...allDebts.map((d) => d.priority_order ?? 0)) + 1,
            }
          : {}),
        // Advance edits: leave remaining_balance / minimum_payment /
        // date_paid_off untouched (owned elsewhere — see above). A linked
        // (non-advance) debt only omits remaining_balance -- minimum_payment
        // and date_paid_off still save normally.
        ...(skipAdvanceLifecycleFields
          ? {}
          : {
              ...(skipRemainingBalanceField ? {} : { remaining_balance: remainingToWrite }),
              minimum_payment: minPaymentToWrite,
              date_paid_off: datePaidOff,
            }),
        usual_payment_account_id: usualPaymentAccountId2,
        linked_account_id: linkedAccountId !== "none" ? linkedAccountId : null,
        starting_balance: startingBalance,
        // Interest rate is optional; the column is NOT NULL default 0, so a
        // blank field stores 0 (a null insert is rejected).
        interest_rate: rate.trim() !== "" && Number.isFinite(Number(rate)) ? Number(rate) : 0,
        due_day: dated ? null : dueDay ? Number(dueDay) : null,
        billing_cycle: cycle.trim().toLowerCase() as BillingCycle,
        cycle_interval_days: intervalDays,
        next_due_date: dated ? nextDue || null : debt?.next_due_date ?? null,
        debt_type: debtType || null,
        institution_id: institutionId === "none" ? null : institutionId,
        category_id: categoryId === "none" ? null : categoryId,
        notes: notes || null,
        is_paycheck_deduction: deduction,
        on_payment_plan: onPlan,
        plan_payment_count: onPlan && planCount ? Number(planCount) : null,
        plan_final_payment: onPlan && planFinal ? Number(planFinal) : null,
        opening_arrears: openingArrears ? Number(openingArrears) : 0,
        arrears_as_of: openingArrears && arrearsAsOf ? arrearsAsOf : null,
        invoice_number: isInvoice ? invoiceNumber.trim() || null : null,
        funding_deduction_id: fundingDeductionId === "none" ? null : fundingDeductionId,
        institution_member_account_id: memberAccountId === "none" ? null : memberAccountId,
      });
      toast.success(isEdit ? "Debt updated" : "Debt added");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }


  async function handleDelete() {
    if (!debt?.id) return;
    if (!confirm("Delete this debt?")) return;
    try {
      await del.mutateAsync(debt.id);
      toast.success("Debt deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit debt" : "Add debt"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
              className="h-11"
            />
            {isInvoice && !nameTouched ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Named automatically from the institution and invoice number — type
                here to override.
              </p>
            ) : null}
          </div>
          <div>
            <Label>Type</Label>
            <Select value={debtType || "none"} onValueChange={chooseType}>
              <SelectTrigger className="h-14 text-base">
                <SelectValue placeholder="Pick a type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="py-3 text-base">
                  Unset
                </SelectItem>
                {DEBT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="py-3 text-base">
                    <span className="flex items-center gap-2">
                      <span aria-hidden>{institutionTypeVisual(t).icon}</span>
                      {formatTypeLabel(t)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-14 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="py-3 text-base">
                  Uncategorized
                </SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="py-3 text-base">
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
                autoName(v, invoiceNumber);
              }}
            >
              <SelectTrigger className="h-14 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="py-3 text-base">
                  None
                </SelectItem>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id} className="py-3 text-base">
                    <span className="flex items-center gap-2">
                      <InstitutionLogo
                        logoUrl={i.logo_url}
                        type={i.institution_type}
                        size={22}
                      />
                      {i.name}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value={ADD_INSTITUTION} className="py-3 text-base">
                  + Add new institution
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* ADR-106: only shown once the institution has member accounts set up
              (InstitutionDialog's "Member accounts" section) — for providers
              that bill each household member separately. */}
          {institutionId !== "none" &&
          allMemberAccounts.some((a) => a.institution_id === institutionId) ? (
            <div>
              <Label>Whose account</Label>
              <Select value={memberAccountId} onValueChange={setMemberAccountId}>
                <SelectTrigger className="h-14 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="py-3 text-base">
                    Joint / not specified
                  </SelectItem>
                  {allMemberAccounts
                    .filter((a) => a.institution_id === institutionId)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id} className="py-3 text-base">
                        {memberLabel(members.find((m) => m.id === a.member_id))}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {/* ADR-068: a deduction that lands in an account can auto-pay this debt. */}
          <div>
            <Label>Funded by deduction</Label>
            <Select value={fundingDeductionId} onValueChange={setFundingDeductionId}>
              <SelectTrigger className="h-14 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="py-3 text-base">
                  Not deduction-funded
                </SelectItem>
                {deductions.map((d) => (
                  <SelectItem
                    key={d.id}
                    value={d.id}
                    disabled={!d.destination_account_id}
                    className="py-3 text-base"
                  >
                    {d.name}
                    {d.destination_account_id ? "" : " — reporting only"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              When the paycheck is marked received, this debt's current cycle is paid
              automatically. Reporting-only deductions can't fund a debt.
            </p>
          </div>
          {/* ADR-074: which account this debt is usually paid from, for Paycheck
              Budget's "Group: Account" view. */}
          <div>
            <Label>Usual payment account</Label>
            <Select value={usualPaymentAccountId} onValueChange={setUsualPaymentAccountId}>
              <SelectTrigger className="h-14 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="py-3 text-base">
                  Not set
                </SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="py-3 text-base">
                    {accountLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* ADR-102: when this debt's balance actually lives on a real
              account (a credit line like "Dave ExtraCash"), linking it here
              makes every advance/fee/repayment also post a mirror
              transaction there, so the account's own history stays real. */}
          <div>
            <Label>Linked account (optional)</Label>
            <Select value={linkedAccountId} onValueChange={setLinkedAccountId}>
              <SelectTrigger className="h-14 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="py-3 text-base">
                  Not linked
                </SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="py-3 text-base">
                    {accountLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              If this debt is really a real account (e.g. a credit line),
              linking it here mirrors every advance, fee, and repayment onto
              that account's own transaction history.
            </p>
          </div>
          {/* ADR-052: invoice reference number drives the auto-composed name. */}
          {isInvoice ? (
            <div>
              <Label>Invoice number</Label>
              <Input
                value={invoiceNumber}
                placeholder="e.g. INV-10428"
                onChange={(e) => {
                  setInvoiceNumber(e.target.value);
                  autoName(institutionId, e.target.value);
                }}
                className="h-11"
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {/*
              Starting balance comes first: for a new invoice it's the number the
              user has in hand, and remaining / minimum payment mirror it until
              they're edited by hand.
            */}
            <div>
              <Label>{isInvoice ? "Original invoice amount" : "Starting balance"}</Label>
              <Input
                type="number"
                step="0.01"
                value={original}
                onChange={(e) => {
                  const v = e.target.value;
                  setOriginal(v);
                  if (!remainingTouched) setRemaining(v);
                  if (!minPayTouched) setMinPay(v);
                }}
                className="h-11"
              />
            </div>
            <div>
              <Label>{isInvoice ? "Amount still owed" : "Remaining balance"}</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Same as starting"
                value={
                  isAdvance
                    ? String(debt?.remaining_balance ?? 0)
                    : isLinked
                      ? String(
                          effectiveDebtBalance(
                            {
                              linked_account_id: debt?.linked_account_id ?? null,
                              remaining_balance: debt?.remaining_balance ?? 0,
                            },
                            accounts,
                            latestBalancesForEdit,
                            transactions,
                          ),
                        )
                      : remaining
                }
                disabled={isAdvance || isLinked}
                onChange={(e) => {
                  setRemainingTouched(true);
                  setRemaining(e.target.value);
                }}
                className="h-11"
              />
              {isAdvance ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Managed automatically — record a draw with "Record advance",
                  and payments bring it down.
                </p>
              ) : isLinked ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Managed automatically from the linked account's balance —
                  log purchases and payments there instead.
                </p>
              ) : null}
            </div>
            <div>
              <Label>Interest rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="Optional"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>{onPlan ? "Payment amount" : "Minimum payment"}</Label>
              <Input
                type="number"
                step="0.01"
                value={isAdvance ? String(debt?.minimum_payment ?? 0) : minPay}
                disabled={isAdvance}
                onChange={(e) => {
                  setMinPayTouched(true);
                  setMinPay(e.target.value);
                }}
                className="h-11"
              />
              {isAdvance ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Always equals the outstanding advance (ADR-056).
                </p>
              ) : null}
            </div>

            {cycle === "monthly" ? (
              <div>
                <Label>Due day</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  className="h-11"
                />
              </div>
            ) : (
              <div>
                <Label>{cycle === "one_time" ? "Due date" : "Next due date"}</Label>
                <Input
                  type="date"
                  value={nextDue}
                  onChange={(e) => {
                    setNextDueTouched(true);
                    setNextDue(e.target.value);
                  }}
                  className="h-11"
                />
              </div>
            )}
          </div>
          <div>
            <Label>Billing cycle</Label>
            <Select value={cycle} onValueChange={(v) => chooseCycle(v as BillingCycle)}>
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
            {cycle === "one_time" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                One-time charges don't roll into a next cycle — clearing the balance closes them out.
              </p>
            ) : null}
          </div>
          {cycle === "custom" ? (
            <CustomCycleFields
              count={cycleCount}
              unit={cycleUnit}
              onCountChange={setCycleCount}
              onUnitChange={setCycleUnit}
            />
          ) : null}

          {/* ADR-048: a big invoice can be broken into a payment plan. */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="pr-3">
                <Label htmlFor="d-plan">On a payment plan</Label>
                <p className="text-xs text-muted-foreground">
                  Pay this off in instalments instead of one lump sum.
                </p>
              </div>
              <Switch id="d-plan" checked={onPlan} onCheckedChange={setOnPlan} />
            </div>
            {onPlan ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Number of payments</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Unknown"
                    value={planCount}
                    onChange={(e) => setPlanCount(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div>
                  <Label>Final payment</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Same amount"
                    value={planFinal}
                    onChange={(e) => setPlanFinal(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
            ) : null}
          </div>

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

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-3">
              <Label htmlFor="d-deduction">Paid via paycheck/HSA deduction</Label>
              <p className="text-xs text-muted-foreground">
                Excluded from pay-period and monthly cash obligations (ADR-032).
              </p>
            </div>
            <Switch id="d-deduction" checked={deduction} onCheckedChange={setDeduction} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 mt-2 gap-2 border-t bg-background px-6 py-3 sm:justify-between">
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
        {/* Inline institution creation keeps the in-progress debt form intact. */}
        <InstitutionDialog
          institution={institutionDialogOpen ? {} : null}
          onClose={() => setInstitutionDialogOpen(false)}
          onSaved={(id) => setInstitutionId(id)}
        />
      </DialogContent>
    </Dialog>
  );
}


/**
 * Ledger rows linked to this debt, newest first. Default: last 10 ("Recent").
 * `month` ("YYYY-MM", ADR-085 addendum): scope to that calendar month instead,
 * for correcting a payment while the detail panel views a prior cycle.
 */
function RecentDebtTransactions({ debt, month }: { debt: Debt; month?: string }) {
  const debtId = debt.id;
  const { data: transactions = [] } = useTransactions();
  const del = useDeleteLinkedTransaction();
  const [detail, setDetail] = useState<Transaction | null>(null);

  const rows = useMemo(() => {
    const linked = transactions
      .filter((t) => t.linked_debt_id === debtId)
      .sort((a, b) => (b.transaction_date ?? "").localeCompare(a.transaction_date ?? ""));
    if (month) return linked.filter((t) => (t.transaction_date ?? "").slice(0, 7) === month);
    return linked.slice(0, 10);
  }, [transactions, debtId, month]);

  return (
    <div>
      <SectionLabel>
        {month ? `Transactions · ${monthLabel(month)}` : "Recent transactions"}
      </SectionLabel>
      {rows.length === 0 ? (
        <EmptyState className="mt-1 py-2 text-left">
          {month ? "No transactions this month." : "No payments logged yet."}
        </EmptyState>
      ) : (
        <div className="mt-1 divide-y divide-border/50">
          {rows.map((t) => {
            // ADR-056 addendum: the advance disbursement row shows for context
            // but Correct/Reverse don't apply — it isn't a payment.
            const disbursement = isAdvanceDisbursement(t);
            return (
              <div key={t.id} className="py-2 text-sm">
                {/* Two-line row: the three action buttons get their own line so
                    nothing crowds or clips off the right edge on phones. */}
                <button
                  type="button"
                  className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded px-1 text-left hover:bg-muted/50"
                  onClick={() => setDetail(t)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {t.transaction_date?.slice(0, 10)}
                    {t.description ? ` · ${t.description}` : ""}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(Number(t.amount ?? 0))}
                  </span>
                </button>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <span className="text-xs capitalize text-muted-foreground">
                    {disbursement ? "advance" : (t.status ?? "—")}
                  </span>
                  <div className="flex shrink-0 items-center justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label="Delete transaction"
                      disabled={del.isPending}
                      onClick={() => {
                        if (!confirm("Delete this ledger transaction? The debt row is left as-is.")) return;
                        del.mutate(t, {
                          onSuccess: () => toast.success("Transaction deleted"),
                          onError: (e: unknown) => toast.error((e as Error).message),
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    {disbursement ? null : (
                      <>
                        <CorrectPaymentButton transaction={t} payable={toPayable("debt", debt)} />
                        <ReversePaymentButton transaction={t} payable={toPayable("debt", debt)} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TransactionDetail transaction={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

/**
 * ADR-102 addendum follow-up: a linked debt's balance is derived from its
 * account's own transactions, but `RecentDebtTransactions` above only shows
 * `linked_debt_id` rows (payments/advances) — never the plain purchases that
 * actually make up the balance. This shows the account's full activity too,
 * read-only (editing/deleting a purchase stays on the Account page; Correct/
 * Reverse only make sense for an actual payment row, not a purchase).
 */
function LinkedAccountActivity({ accountId, month }: { accountId: string; month?: string }) {
  const { data: transactions = [] } = useTransactions();
  const [detail, setDetail] = useState<Transaction | null>(null);

  const rows = useMemo(() => {
    const onAccount = transactions
      .filter((t) => t.account_id === accountId)
      .sort((a, b) => (b.transaction_date ?? "").localeCompare(a.transaction_date ?? ""));
    if (month) return onAccount.filter((t) => (t.transaction_date ?? "").slice(0, 7) === month);
    return onAccount.slice(0, 10);
  }, [transactions, accountId, month]);

  return (
    <div>
      <SectionLabel>
        {month ? `Card activity · ${monthLabel(month)}` : "Card activity"}
      </SectionLabel>
      {rows.length === 0 ? (
        <EmptyState className="mt-1 py-2 text-left">
          {month ? "No activity this month." : "No activity logged yet."}
        </EmptyState>
      ) : (
        <div className="mt-1 divide-y divide-border/50">
          {rows.map((t) => (
            <button
              key={t.id}
              type="button"
              className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded px-1 py-2 text-left text-sm hover:bg-muted/50"
              onClick={() => setDetail(t)}
            >
              <span className="min-w-0 flex-1 truncate">
                {t.transaction_date?.slice(0, 10)}
                {t.description ? ` · ${t.description}` : ""}
              </span>
              <span className="shrink-0 tabular-nums">{formatMoney(Number(t.amount ?? 0))}</span>
            </button>
          ))}
        </div>
      )}

      <TransactionDetail transaction={detail} onClose={() => setDetail(null)} />
    </div>
  );
}


/**
 * ADR-045: non-payment changes to what a debt owes (insurance coverage,
 * discounts, late/NSF fees). Adjustments only move remaining_balance — they
 * never touch transactions or account balances.
 * ADR-056: 'advance' adjustment_type rows are written by useCreateAdvance and
 * deleted by useDeleteAdvance (which also reverses the paired deposit tx).
 */
function DebtAdjustments({ debt }: { debt: Debt }) {
  const { data: allAdjustments = [] } = useDebtAdjustments();
  const { data: allTransactions = [] } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const adjustments = useMemo(
    () => allAdjustments.filter((a) => a.debt_id === debt.id && a.adjustment_type !== "advance"),
    [allAdjustments, debt.id],
  );
  const advances = useMemo(
    () => allAdjustments.filter((a) => a.debt_id === debt.id && a.adjustment_type === "advance"),
    [allAdjustments, debt.id],
  );
  const add = useAddDebtAdjustment();
  const remove = useDeleteDebtAdjustment();
  const createAdvance = useCreateAdvance();
  const deleteAdvance = useDeleteAdvance();

  /**
   * Every debt-balance mutation applies against whatever the balance
   * currently is at click-time, not a chronological replay — so backfilling
   * an advance/adjustment/payment dated earlier than this debt's existing
   * history silently produces a wrong balance (found via the OnePay Advance
   * incident, 2026-08-24). This warns (doesn't block) before that happens.
   */
  const mostRecentEntryDate = useMemo(() => {
    const dates = [
      ...allAdjustments.filter((a) => a.debt_id === debt.id).map((a) => a.adjustment_date),
      ...allTransactions
        .filter((t) => t.linked_debt_id === debt.id)
        .map((t) => t.transaction_date),
    ].filter((d): d is string => !!d);
    return dates.length ? dates.reduce((max, d) => (d > max ? d : max)) : null;
  }, [allAdjustments, allTransactions, debt.id]);

  function confirmIfBackdated(newDate: string): boolean {
    if (!mostRecentEntryDate || newDate >= mostRecentEntryDate) return true;
    return confirm(
      `This date (${newDate}) is older than ${debt.name}'s most recent entry (${mostRecentEntryDate}). Backfilling out of order can produce a wrong balance — continue anyway?`,
    );
  }

  // --- Adjustment dialog state ---
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("insurance_covered");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [affectsBalance, setAffectsBalance] = useState(true);

  // --- Advance dialog state ---
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceAccountId, setAdvanceAccountId] = useState("none");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState(format(new Date(), "yyyy-MM-dd"));

  async function save() {
    const value = Number(amount);
    if (!value) {
      toast.error("Enter a non-zero amount");
      return;
    }
    if (!confirmIfBackdated(date)) return;
    try {
      await add.mutateAsync({
        debt,
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

  async function saveAdvance() {
    const value = Number(advanceAmount);
    if (!value || value <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    if (!advanceAccountId || advanceAccountId === "none") {
      toast.error("Pick a destination account");
      return;
    }
    if (!confirmIfBackdated(advanceDate)) return;
    try {
      await createAdvance.mutateAsync({
        debt,
        destinationAccountId: advanceAccountId,
        amount: value,
        advanceDate,
      });
      toast.success("Advance recorded");
      setAdvanceOpen(false);
      setAdvanceAmount("");
      setAdvanceAccountId("none");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {/* ---- Adjustments section ---- */}
      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Adjustments</SectionLabel>
          {/* ADR-102 addendum: hidden once linked -- remaining_balance is
              derived from the account, so an adjustment here would be a
              silent no-op. */}
          {debt.linked_account_id ? null : (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          )}
        </div>
        {debt.linked_account_id ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Managed automatically from the linked account — log purchases and
            payments there instead.
          </p>
        ) : null}
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
                      await remove.mutateAsync({ adjustment: a, debt });
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
      </div>

      {/* ---- Advances section (ADR-056) ---- */}
      {/* SCRATCHPAD "Next Steps": only advance-type debts have a real
          "advance" concept -- gate the whole section on debt_type, not
          just on linked_account_id. */}
      {debt.debt_type === "advance" && (
        <div>
          <div className="flex items-center justify-between">
            <SectionLabel>Advances</SectionLabel>
            {/* ADR-102 addendum: hidden once linked -- same reasoning as
                Adjustments above. */}
            {debt.linked_account_id ? null : (
              <Button size="sm" variant="outline" className="h-8" onClick={() => setAdvanceOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {debt.linked_account_id
              ? "Managed automatically from the linked account — log purchases and payments there instead."
              : "Money borrowed against this debt — deposits into an account and increases balance owed."}
          </p>
          {advances.length === 0 ? (
            <p className="mt-1 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
              No advances recorded.
            </p>
          ) : (
            <div className="mt-1 divide-y divide-border/50 rounded-md border">
              {advances.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{formatMoney(Number(a.amount))}</p>
                    <p className="text-xs text-muted-foreground">{a.adjustment_date}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={async () => {
                      if (!confirm("Delete this advance? This will also reverse the deposit transaction.")) return;
                      try {
                        await deleteAdvance.mutateAsync({ adjustment: a, debt });
                        toast.success("Advance deleted");
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
        </div>
      )}

      {/* ---- Add Adjustment dialog ---- */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden">
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
                  {ADJUSTMENT_TYPES.map((t) => (
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
                <Label htmlFor="adj-affects">Affects balance</Label>
                <p className="text-xs text-muted-foreground">
                  {affectsBalance
                    ? "Updates remaining balance immediately."
                    : "Record only — doesn't change what's owed."}
                </p>
              </div>
              <Switch
                id="adj-affects"
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

      {/* ---- Add Advance dialog (ADR-056) ---- */}
      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Record advance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Destination account</Label>
              <Select value={advanceAccountId} onValueChange={setAdvanceAccountId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pick an account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pick an account</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                The account receiving the advance funds.
              </p>
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                min="0"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={advanceDate}
                onChange={(e) => setAdvanceDate(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button className="h-11 w-full" onClick={saveAdvance} disabled={createAdvance.isPending}>
              Record advance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
