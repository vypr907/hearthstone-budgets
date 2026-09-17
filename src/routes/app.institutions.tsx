import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  useInstitutions,
  useAccounts,
  useLatestBalances,
  useCategories,
  useInstitutionCategories,
  useInstitutionLinks,
  useInstitutionMemberAccounts,
  useBills,
  useEffectiveDebts,
  useTransactions,
} from "@/lib/data-hooks";
import { useHouseholdMembers, memberLabel } from "@/lib/household";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { computeBalances, computeInstitutionTotals, isDebtPaidOff } from "@/lib/balances";
import { internalTransferIds } from "@/lib/internal-transfers";
import { setTxPreFilter } from "@/lib/tx-filter-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { Bill, Debt, Institution, Transaction } from "@/lib/supabase";
import { DetailGrid, DetailItem, DetailText } from "@/components/detail";
import { EmptyState } from "@/components/EmptyState";
import { SectionLabel } from "@/components/SectionLabel";
import { InstitutionLogo } from "@/components/InstitutionLogo";
import { InstitutionLoginButton } from "@/components/InstitutionLoginButton";
import { TransactionDetail } from "@/routes/app.transactions";
import { useAddTransactionPreset } from "@/components/AddTransactionPreset";
import { formatTypeLabel } from "@/lib/visual-meta";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { InstitutionDialog } from "@/components/InstitutionDialog";

export const Route = createFileRoute("/app/institutions")({
  head: () => ({
    meta: [
      { title: "Institutions — Hearthstone" },
      {
        name: "description",
        content:
          "Keep every bank, lender, and biller your household uses, with login links and their accounts.",
      },
      { property: "og:title", content: "Institutions — Hearthstone" },
      {
        property: "og:description",
        content:
          "Keep every bank, lender, and biller your household uses, with login links and their accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InstitutionsPage,
});

function InstitutionsPage() {
  const { data: institutions = [], isLoading } = useInstitutions();
  const { data: categories = [] } = useCategories();
  const { data: instCats = {} } = useInstitutionCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: latest = {} } = useLatestBalances();
  const { data: transactions = [] } = useTransactions();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useEffectiveDebts();
  const balances = computeBalances(accounts, latest, transactions);
  const categoryName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const [editing, setEditing] = useState<Partial<Institution> | null>(null);
  const [detail, setDetail] = useState<Institution | null>(null);
  const [groupBy, setGroupBy] = useState<"none" | "type" | "category">("none");

  // ADR-106: a child institution's money is already counted in its parent's
  // total (computeInstitutionTotals rolls it up) — showing both here would
  // double-count. Children stay fully reachable via the parent's own detail
  // dialog ("Sub-institutions" section below).
  const rootInstitutions = institutions.filter((i) => !i.parent_institution_id);

  // UI-only grouping: an institution with several categories appears under each.
  const groups: Array<{ key: string; label: string; rows: Institution[] }> = (() => {
    if (groupBy === "none") return [{ key: "all", label: "", rows: rootInstitutions }];
    const map = new Map<string, { label: string; rows: Institution[] }>();
    for (const i of rootInstitutions) {
      const keys: Array<[string, string]> =
        groupBy === "type"
          ? [[i.institution_type?.trim() || "__none__", formatTypeLabel(i.institution_type)]]
          : (instCats[i.id] ?? []).length
            ? (instCats[i.id] ?? []).map((cid) => [cid, categoryName[cid] ?? "Category"])
            : [["__none__", "No category"]];
      for (const [k, label] of keys) {
        if (!map.has(k)) map.set(k, { label, rows: [] });
        map.get(k)!.rows.push(i);
      }
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })();

  return (
    <>
      <AppHeader title="Institutions" />
      <div className="space-y-3 p-4">
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add institution
        </Button>

        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Group by</Label>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
            <SelectTrigger className="h-11 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="type">Type</SelectItem>
              <SelectItem value="category">Category</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rootInstitutions.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No institutions yet.
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              {g.label ? (
                <p className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {g.label}
                </p>
              ) : null}
              {g.rows.map((i) => {
                const totals = computeInstitutionTotals(
                  i.id,
                  accounts,
                  balances,
                  bills,
                  debts,
                  institutions,
                );
                return (
                  <Card key={i.id} className="cursor-pointer" onClick={() => setDetail(i)}>
                    <CardContent className="flex items-start gap-3 p-3">
                      <InstitutionLogo logoUrl={i.logo_url} type={i.institution_type} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{i.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatTypeLabel(i.institution_type)}
                          {i.sign_in_with_google ? " · Google sign-in" : ""}
                        </p>
                        {(instCats[i.id] ?? []).length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(instCats[i.id] ?? []).map((cid) => (
                              <Badge key={cid} variant="secondary" className="text-[10px]">
                                {categoryName[cid] ?? "Category"}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        {i.description ? (
                          <p className="truncate text-xs text-muted-foreground">{i.description}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold">
                          {totals.currentBalance == null ? "—" : formatMoney(totals.currentBalance)}
                        </p>
                        {totals.currentDue != null ? (
                          <p className="text-xs text-muted-foreground">
                            Due {formatMoney(totals.currentDue)}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(i);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <InstitutionDialog institution={editing} onClose={() => setEditing(null)} />
      <InstitutionDetail
        institution={detail}
        onClose={() => setDetail(null)}
        onEdit={(i) => {
          setDetail(null);
          setEditing(i);
        }}
        onSelect={setDetail}
      />
    </>
  );
}

/** Jan 1 of the current calendar year — matches Year in Review/Monthly Summary elsewhere. */
function thisYearStartISO(): string {
  return `${new Date().getFullYear()}-01-01`;
}

/**
 * Every real-spend (outflow, non-internal-transfer, ADR-089) transaction at
 * an institution — bill/debt payments already inherit the payable's
 * `institution_id` at write time (ADR-065), so this one filter already
 * covers bills/debts/plain expenses together. `since` optionally scopes to
 * on/after that date (calendar-year cutoff); omitted means all time.
 */
function spendTransactions(
  institutionId: string,
  transactions: Transaction[],
  internal: Set<string>,
  since?: string,
): Transaction[] {
  return transactions.filter(
    (t) =>
      t.institution_id === institutionId &&
      !(t.transfer_group_id && internal.has(t.transfer_group_id)) &&
      (!since || (t.transaction_date ?? "") >= since) &&
      -Number(t.amount ?? 0) > 0,
  );
}

const sumSpend = (txns: Transaction[]) =>
  txns.reduce((sum, t) => sum + -Number(t.amount ?? 0), 0);

/**
 * ADR-106 addendum: bucket an institution's bills+debts TOGETHER by which
 * member's account they belong to, with one combined total per person —
 * e.g. Alpine Medical shows a "Steven" section (his bills + debts + total)
 * and a "Stephanie" section (hers), not a separate Bills-grouped-by-member
 * section and a separate Debts-grouped-by-member section.
 *
 * Also buckets the institution's own spend transactions per member, via
 * each transaction's `linked_bill_id`/`linked_debt_id` → that bill/debt's
 * own member-account. A transaction with no bill/debt link (a plain
 * purchase) can't be attributed to a person and lands in the same
 * "Joint / not specified" bucket as unassigned bills/debts, so the
 * buckets' spend always sums to the institution total.
 */
function groupObligationsByMember(
  institutionId: string,
  bills: Bill[],
  debts: Debt[],
  transactions: Transaction[],
  internal: Set<string>,
  labelFor: (accountId: string | null | undefined) => string,
): Array<{
  label: string;
  accountId: string | null;
  bills: Bill[];
  debts: Debt[];
  total: number;
  spentThisYear: number;
  spentAllTime: number;
}> {
  const map = new Map<string, { bills: Bill[]; debts: Debt[] }>();
  const bucket = (key: string) => map.get(key) ?? map.set(key, { bills: [], debts: [] }).get(key)!;
  for (const b of bills) bucket(b.institution_member_account_id ?? "__joint__").bills.push(b);
  for (const d of debts) bucket(d.institution_member_account_id ?? "__joint__").debts.push(d);

  const billKey = new Map(bills.map((b) => [b.id, b.institution_member_account_id ?? "__joint__"]));
  const debtKey = new Map(debts.map((d) => [d.id, d.institution_member_account_id ?? "__joint__"]));
  const thisYearStart = thisYearStartISO();
  const spendByKey = new Map<string, { year: number; all: number }>();
  for (const t of spendTransactions(institutionId, transactions, internal)) {
    const key =
      (t.linked_bill_id && billKey.get(t.linked_bill_id)) ||
      (t.linked_debt_id && debtKey.get(t.linked_debt_id)) ||
      "__joint__";
    if (!map.has(key)) bucket(key);
    const entry = spendByKey.get(key) ?? { year: 0, all: 0 };
    const amount = -Number(t.amount ?? 0);
    entry.all += amount;
    if ((t.transaction_date ?? "") >= thisYearStart) entry.year += amount;
    spendByKey.set(key, entry);
  }

  return [...map.entries()]
    .map(([key, group]) => {
      const spend = spendByKey.get(key) ?? { year: 0, all: 0 };
      return {
        label: labelFor(key === "__joint__" ? null : key),
        accountId: key === "__joint__" ? null : key,
        bills: group.bills,
        debts: group.debts,
        total:
          group.bills.reduce((sum, b) => sum + Number(b.amount ?? 0), 0) +
          group.debts.reduce((sum, d) => sum + Number(d.remaining_balance ?? 0), 0),
        spentThisYear: spend.year,
        spentAllTime: spend.all,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** One bill row — shared between the flat and member-grouped renderings. */
function BillRow({ bill }: { bill: Bill }) {
  return (
    <Card className={bill.is_active === false ? "opacity-60" : undefined}>
      <CardContent className="flex items-center gap-3 p-3">
        <p className="min-w-0 flex-1 truncate font-medium">
          {bill.name}
          {bill.is_active === false ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">· Inactive</span>
          ) : null}
        </p>
        <p className="shrink-0 font-semibold">{formatMoney(Number(bill.amount ?? 0))}</p>
      </CardContent>
    </Card>
  );
}

/** One debt row — shared between the flat and member-grouped renderings. */
function DebtRow({ debt }: { debt: Debt }) {
  const paidOff = isDebtPaidOff(debt, Number(debt.remaining_balance ?? 0));
  return (
    <Card className={paidOff ? "opacity-60" : undefined}>
      <CardContent className="flex items-center gap-3 p-3">
        {paidOff ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {debt.name}
            {paidOff ? (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">· Paid off</span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            Min {formatMoney(Number(debt.minimum_payment ?? 0))}
          </p>
        </div>
        <p className="shrink-0 font-semibold">{formatMoney(Number(debt.remaining_balance ?? 0))}</p>
      </CardContent>
    </Card>
  );
}

function InstitutionDetail({
  institution,
  onClose,
  onEdit,
  onSelect,
}: {
  institution: Institution | null;
  onClose: () => void;
  onEdit: (i: Institution) => void;
  /** ADR-106: swap the currently-open detail to a different institution — used to
   *  navigate to a parent/child (e.g. Amazon <-> Prime) without closing the dialog. */
  onSelect: (i: Institution) => void;
}) {
  const { data: institutions = [] } = useInstitutions();
  const { data: accounts = [] } = useAccounts();
  const { data: latest = {} } = useLatestBalances();
  const { data: categories = [] } = useCategories();
  const { data: instCats = {} } = useInstitutionCategories();
  const { data: allLinks = [] } = useInstitutionLinks();
  const { data: allMemberAccounts = [] } = useInstitutionMemberAccounts();
  const { data: members = [] } = useHouseholdMembers();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useEffectiveDebts();
  const { data: transactions = [] } = useTransactions();
  const balances = computeBalances(accounts, latest, transactions);
  const { openWithPreset } = useAddTransactionPreset();
  const navigate = useNavigate();
  const [txDetail, setTxDetail] = useState<Transaction | null>(null);
  if (!institution) return null;
  const totals = computeInstitutionTotals(
    institution.id,
    accounts,
    balances,
    bills,
    debts,
    institutions,
  );
  const catIds = instCats[institution.id] ?? [];
  const catNames = categories.filter((c) => catIds.includes(c.id));
  const linked = accounts.filter((a) => a.institution_id === institution.id);
  const linkedBills = bills.filter((b) => b.institution_id === institution.id);
  const linkedDebts = debts.filter((d) => d.institution_id === institution.id);
  const institutionLinks = allLinks.filter((l) => l.institution_id === institution.id);
  const memberAccounts = allMemberAccounts.filter((m) => m.institution_id === institution.id);
  /** ADR-106: label a bill/debt's institution_member_account_id — the account this belongs to, or "Joint" when unset. */
  const memberAccountLabel = (accountId: string | null | undefined) => {
    if (!accountId) return "Joint / not specified";
    const acct = memberAccounts.find((a) => a.id === accountId);
    return acct ? memberLabel(members.find((m) => m.id === acct.member_id)) : "Unknown";
  };
  /** Only worth grouping when the institution actually has more than one member account. */
  const groupByMember = memberAccounts.length > 1;
  const internal = internalTransferIds(transactions);
  const memberGroups = groupByMember
    ? groupObligationsByMember(
        institution.id,
        linkedBills,
        linkedDebts,
        transactions,
        internal,
        memberAccountLabel,
      )
    : [];
  const spentThisYear = sumSpend(
    spendTransactions(institution.id, transactions, internal, thisYearStartISO()),
  );
  const spentAllTime = sumSpend(spendTransactions(institution.id, transactions, internal));
  const recentTransactions = transactions
    .filter((t) => t.institution_id === institution.id)
    .sort((a, b) => (b.transaction_date ?? "").localeCompare(a.transaction_date ?? ""))
    .slice(0, 8);
  // ADR-106: children — hidden from the top-level list, shown here instead.
  const children = institutions.filter((i) => i.parent_institution_id === institution.id);
  const parent = institution.parent_institution_id
    ? institutions.find((i) => i.id === institution.parent_institution_id)
    : null;

  return (
    <>
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <InstitutionLogo
              logoUrl={institution.logo_url}
              type={institution.institution_type}
              size={32}
            />
            {institution.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <DetailGrid>
            <DetailItem label="Type" value={formatTypeLabel(institution.institution_type)} />
            <DetailItem
              label="Sign in with Google"
              value={institution.sign_in_with_google ? "Yes" : "No"}
            />
            <DetailItem label="Login username" value={institution.login_username ?? "—"} />
            <DetailItem
              label="Main site"
              value={
                institution.login_url ? (
                  <a
                    href={institution.login_url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-primary underline"
                  >
                    Open
                  </a>
                ) : (
                  "—"
                )
              }
            />
            {parent ? (
              <DetailItem
                label="Part of"
                value={
                  <button
                    type="button"
                    className="underline decoration-dotted underline-offset-2"
                    onClick={() => onSelect(parent)}
                  >
                    {parent.name}
                  </button>
                }
              />
            ) : null}
          </DetailGrid>
          {groupByMember ? null : (
            <InstitutionLoginButton institution={institution} links={institutionLinks} />
          )}
          <DetailGrid>
            <DetailItem
              label="Current balance"
              value={totals.currentBalance == null ? "—" : formatMoney(totals.currentBalance)}
            />
            <DetailItem
              label="Current due"
              value={totals.currentDue == null ? "—" : formatMoney(totals.currentDue)}
            />
            <DetailItem label="Spent this year" value={formatMoney(spentThisYear)} />
            <DetailItem label="Spent all time" value={formatMoney(spentAllTime)} />
          </DetailGrid>
          {children.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sub-institutions
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Rolled up into the totals above — tap one to see its own detail.
              </p>
              <div className="space-y-2">
                {children.map((c) => (
                  <Card key={c.id} className="cursor-pointer" onClick={() => onSelect(c)}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <InstitutionLogo logoUrl={c.logo_url} type={c.institution_type} />
                      <p className="min-w-0 flex-1 truncate font-medium">{c.name}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Categories
            </p>
            {catNames.length === 0 ? (
              <p className="text-sm text-muted-foreground">No categories.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {catNames.map((c) => (
                  <Badge key={c.id} variant="secondary">
                    {c.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DetailText label="Description" value={institution.description} />
          <DetailText label="Notes" value={institution.notes} />

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Accounts
            </p>
            {linked.length === 0 && (
              <p className="text-sm text-muted-foreground">No accounts linked.</p>
            )}
            <div className="space-y-2">
              {linked.map((a) => {
                const bal = latest[a.id];
                const value = bal ? Number(bal.balance) : Number(a.starting_balance ?? 0);
                return (
                  <Card key={a.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.account_type || "Account"}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">{formatMoney(value)}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {groupByMember ? (
            <div className="space-y-4">
              {memberGroups.map((g) => {
                const account = g.accountId
                  ? memberAccounts.find((a) => a.id === g.accountId)
                  : null;
                return (
                  <div key={g.label}>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1">
                        <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {g.label}
                        </p>
                        <InstitutionLoginButton
                          institution={institution}
                          links={institutionLinks}
                          usernameHint={account?.login_username}
                          compact
                        />
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatMoney(g.total)}
                      </span>
                    </div>
                    <p className="mb-2 text-xs text-muted-foreground">
                      This year: {formatMoney(g.spentThisYear)} · All time: {formatMoney(g.spentAllTime)}
                    </p>
                    {g.bills.length === 0 && g.debts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nothing linked.</p>
                    ) : (
                      <div className="space-y-2">
                        {g.bills.map((b) => (
                          <BillRow key={b.id} bill={b} />
                        ))}
                        {g.debts.map((d) => (
                          <DebtRow key={d.id} debt={d} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Bills
                </p>
                {linkedBills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bills linked.</p>
                ) : (
                  <div className="space-y-2">
                    {linkedBills.map((b) => (
                      <BillRow key={b.id} bill={b} />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Debts
                </p>
                {linkedDebts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No debts linked.</p>
                ) : (
                  <div className="space-y-2">
                    {linkedDebts.map((d) => (
                      <DebtRow key={d.id} debt={d} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <div>
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Recent transactions</SectionLabel>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => {
                  setTxPreFilter({ institutionId: institution.id, label: institution.name });
                  onClose();
                  void navigate({ to: "/app/transactions" });
                }}
              >
                View all
              </Button>
            </div>
            {recentTransactions.length === 0 ? (
              <EmptyState className="mt-1 py-2 text-left">No transactions yet.</EmptyState>
            ) : (
              <div className="mt-1 divide-y divide-border/50">
                {recentTransactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex cursor-pointer items-center justify-between gap-2 py-2 text-sm"
                    onClick={() => setTxDetail(t)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {t.transaction_date?.slice(0, 10)}
                        {t.description ? ` · ${t.description}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs capitalize text-muted-foreground">
                      {t.status ?? "—"}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(Number(t.amount ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="h-11"
            onClick={() => {
              onClose();
              openWithPreset({ institutionId: institution.id });
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add transaction
          </Button>
          <Button variant="outline" className="h-11" onClick={() => onEdit(institution)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Button>
          <Button className="h-11" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <TransactionDetail transaction={txDetail} onClose={() => setTxDetail(null)} />
    </>
  );
}
