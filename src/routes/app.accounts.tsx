import { createFileRoute } from "@tanstack/react-router";
import { AccountDialog } from "@/components/AccountDialog";
import { EmptyState } from "@/components/EmptyState";
import { SectionLabel } from "@/components/SectionLabel";
import { AppHeader } from "@/components/AppHeader";
import { TransactionTitle } from "@/components/TransactionTitle";
import {
  useAccountBalances,
  useAccounts,
  useCategories,
  useInstitutions,
  useLatestBalances,
  useLogBalance,
  useTransactions,
} from "@/lib/data-hooks";
import { formatMoney, accountLast4 } from "@/lib/format";
import { computeBalances } from "@/lib/balances";
import { useHouseholdMembers, memberLabel } from "@/lib/household";
import { groupLedgerRows } from "@/lib/split-groups";
import {
  DetailGrid,
  DetailItem,
  DetailMoney,
  DetailText,
  LogoLabel,
  ValueChip,
} from "@/components/detail";
import { InstitutionLoginButton } from "@/components/InstitutionLoginButton";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Pencil, Plus, Search, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Account, AccountBalance, Institution, Transaction } from "@/lib/supabase";
import { format, parseISO } from "date-fns";
import { ObligationIcon, useInstitutionIndex } from "@/components/ObligationIcon";
import { TransactionDetail } from "@/routes/app.transactions";

export const Route = createFileRoute("/app/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts & Balances — Hearthstone" },
      {
        name: "description",
        content:
          "Track current and spendable balances per account and log new balance snapshots in Hearthstone.",
      },
      { property: "og:title", content: "Accounts & Balances — Hearthstone" },
      {
        property: "og:description",
        content:
          "Track current and spendable balances per account and log new balance snapshots in Hearthstone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const { data: accounts = [], isLoading } = useAccounts();
  const { data: latest = {} } = useLatestBalances();
  const { data: transactions = [] } = useTransactions();
  const { data: institutions = [] } = useInstitutions();
  const { data: members = [] } = useHouseholdMembers();
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const [logging, setLogging] = useState<Account | null>(null);
  /** Reuses the Transactions screen detail dialog for recent-activity rows. */
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [viewing, setViewing] = useState<Account | null>(null);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "current" | "type">("name");
  const [typeFilter, setTypeFilter] = useState("all");
  const [instFilter, setInstFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");

  const institutionById = useInstitutionIndex(institutions);
  const memberById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m])),
    [members],
  );

  const accountName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of accounts) m[a.id] = a.name;
    return m;
  }, [accounts]);
  // ADR-098 addendum: same cross-account transfer-title resolution the
  // Transactions screen uses, now shared here too — these lists only ever
  // had a single account's rows in hand before, so a transfer's other leg
  // was unreachable.
  const transferTitleAccounts = useMemo(() => {
    const legsByGroup: Record<string, Transaction[]> = {};
    for (const t of transactions) {
      if (!t.transfer_group_id) continue;
      (legsByGroup[t.transfer_group_id] ||= []).push(t);
    }
    const m: Record<string, { from: string; to: string }> = {};
    for (const legs of Object.values(legsByGroup)) {
      const from = legs.find((l) => Number(l.amount) < 0);
      const to = legs.find((l) => Number(l.amount) >= 0);
      if (!from || !to) continue;
      const pair = {
        from: accountName[from.account_id ?? ""] ?? "—",
        to: accountName[to.account_id ?? ""] ?? "—",
      };
      for (const l of legs) m[l.id] = pair;
    }
    return m;
  }, [transactions, accountName]);


  const accountTypes = useMemo(
    () => [...new Set(accounts.map((a) => a.account_type).filter(Boolean))].sort() as string[],
    [accounts],
  );

  const balances = useMemo(
    () => computeBalances(accounts, latest, transactions),
    [accounts, latest, transactions],
  );

  /** Recent ledger rows per account, newest first (bank-statement style). */
  const recentByAccount = useMemo(() => {
    const out: Record<string, typeof transactions> = {};
    const sorted = [...transactions].sort((a, b) =>
      b.transaction_date.localeCompare(a.transaction_date),
    );
    for (const t of sorted) {
      if (!t.account_id) continue;
      (out[t.account_id] ??= []).push(t);
    }
    return out;
  }, [transactions]);

  const rows = useMemo(() => {
    let out = accounts;
    if (typeFilter !== "all") {
      out =
        typeFilter === "none"
          ? out.filter((a) => !a.account_type)
          : out.filter((a) => a.account_type === typeFilter);
    }
    if (instFilter !== "all") {
      out =
        instFilter === "none"
          ? out.filter((a) => !a.institution_id)
          : out.filter((a) => a.institution_id === instFilter);
    }
    if (ownerFilter !== "all") {
      out =
        ownerFilter === "joint"
          ? out.filter((a) => !a.owner_member_id)
          : out.filter((a) => a.owner_member_id === ownerFilter);
    }
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter((a) => a.name.toLowerCase().includes(t));
    }
    return [...out].sort((a, b) => {
      if (sort === "current")
        return (balances[b.id]?.current ?? 0) - (balances[a.id]?.current ?? 0);
      if (sort === "type")
        return (
          (a.account_type ?? "").localeCompare(b.account_type ?? "") || a.name.localeCompare(b.name)
        );
      return a.name.localeCompare(b.name);
    });
  }, [accounts, typeFilter, instFilter, ownerFilter, q, sort, balances]);

  return (
    <>
      <AppHeader title="Accounts & Balances" />
      <div className="space-y-3 p-4">
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add account
        </Button>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search accounts…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-12 pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="current">Sort: Current balance</SelectItem>
              <SelectItem value="type">Sort: Account type</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="none">No type</SelectItem>
              {accountTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={members.length > 1 ? "grid grid-cols-2 gap-2" : ""}>
          <Select value={instFilter} onValueChange={setInstFilter}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All institutions</SelectItem>
              <SelectItem value="none">No institution</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {members.length > 1 && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                <SelectItem value="joint">Joint / shared</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {memberLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <Card>
            <CardContent className="p-0">
              <EmptyState>
                {accounts.length === 0 ? "No accounts yet." : "Nothing matches."}
              </EmptyState>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {rows.map((a) => {
            const b = balances[a.id];
            return (
              <Card
                key={a.id}
                className="cursor-pointer"
                onClick={() => setViewing(a)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <ObligationIcon
                      institution={institutionById[a.institution_id ?? ""]}
                      name={`${a.name} ${a.account_type ?? ""}`}
                      fallback="🏛️"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {a.name}
                        {accountLast4(a.account_number) ? (
                          <span className="ml-1 font-normal text-muted-foreground">
                            •••{accountLast4(a.account_number)}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.account_type || "Account"}
                        {a.owner_member_id
                          ? ` · ${memberLabel(memberById[a.owner_member_id])}`
                          : members.length > 1
                            ? " · joint"
                            : ""}
                        {b?.asOf
                          ? ` · snapshot ${format(parseISO(b.asOf), "MMM d")}`
                          : " · starting balance"}
                      </p>

                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(a);
                      }}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-[12px] bg-muted/50 p-2">
                      <SectionLabel size="sub">Current</SectionLabel>
                      <p className="text-xl font-extrabold tabular-nums">
                        {formatMoney(b?.current ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-[12px] bg-muted/50 p-2">
                      <SectionLabel size="sub">Spendable</SectionLabel>
                      <p className="text-xl font-extrabold tabular-nums">
                        {formatMoney(b?.spendable ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    <RecentActivity
                      rows={recentByAccount[a.id] ?? []}
                      institutionById={institutionById}
                      transferTitleAccounts={transferTitleAccounts}
                      onSelect={setDetail}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="mt-2 h-10 w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLogging(a);
                    }}
                  >
                    <TrendingUp className="mr-2 h-4 w-4" /> Log new balance
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <AccountDialog account={editing} onClose={() => setEditing(null)} />
      <LogBalanceDialog account={logging} onClose={() => setLogging(null)} />
      <TransactionDetail transaction={detail} onClose={() => setDetail(null)} />
      <AccountDetailDialog
        account={viewing}
        institution={viewing ? institutionById[viewing.institution_id ?? ""] : null}
        owner={viewing?.owner_member_id ? memberById[viewing.owner_member_id] : null}
        jointFallback={members.length > 1}
        balance={viewing ? balances[viewing.id] : undefined}
        transactions={viewing ? (recentByAccount[viewing.id] ?? []) : []}
        institutionById={institutionById}
        transferTitleAccounts={transferTitleAccounts}
        onClose={() => setViewing(null)}
        onEdit={(a) => {
          setViewing(null);
          setEditing(a);
        }}
        onLogBalance={(a) => setLogging(a)}
      />
    </>
  );
}

/**
 * Issue #56: full account detail — metadata, ADR-093 login button, balance
 * snapshot history, and the complete transaction list (not just recent).
 */
function AccountDetailDialog({
  account,
  institution,
  owner,
  jointFallback,
  balance,
  transactions,
  institutionById,
  transferTitleAccounts,
  onClose,
  onEdit,
  onLogBalance,
}: {
  account: Account | null;
  institution?: Institution | null;
  owner?: { display_name?: string | null } | null;
  jointFallback: boolean;
  balance?: { current: number; spendable: number };
  transactions: Transaction[];
  institutionById: Record<string, Institution>;
  transferTitleAccounts: Record<string, { from: string; to: string }>;
  onClose: () => void;
  onEdit: (a: Account) => void;
  onLogBalance: (a: Account) => void;
}) {
  const { data: history = [] } = useAccountBalances(account?.id);
  const [txDetail, setTxDetail] = useState<Transaction | null>(null);

  if (!account) return null;
  const last4 = accountLast4(account.account_number);

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ObligationIcon
                institution={institution}
                name={`${account.name} ${account.account_type ?? ""}`}
                fallback="🏛️"
                size={28}
              />
              {account.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <DetailGrid>
              <DetailMoney label="Current balance" value={balance?.current} />
              <DetailMoney label="Spendable balance" value={balance?.spendable} />
              <DetailItem label="Type" value={<ValueChip value={account.account_type} />} />
              <DetailItem
                label="Institution"
                value={
                  <LogoLabel
                    name={institution?.name}
                    logoUrl={institution?.logo_url}
                    type={institution?.institution_type}
                  />
                }
              />
              <DetailItem
                label="Owner"
                value={owner ? memberLabel(owner) : jointFallback ? "Joint / shared" : "—"}
              />
              <DetailItem label="Card / account #" value={last4 ? `•••${last4}` : "—"} />
              <DetailMoney label="Credit limit" value={account.credit_limit} />
            </DetailGrid>
            <InstitutionLoginButton institution={institution} />
            <DetailText label="Notes" value={account.notes} />
            <AccountBalanceHistory history={history} />
            <AccountAllTransactions
              rows={transactions}
              institutionById={institutionById}
              transferTitleAccounts={transferTitleAccounts}
              onSelect={setTxDetail}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => onLogBalance(account)}>
              <TrendingUp className="mr-2 h-4 w-4" /> Log balance
            </Button>
            <Button variant="outline" className="h-11" onClick={() => onEdit(account)}>
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

/** Reverse-chronological list of logged balance snapshots for one account. */
function AccountBalanceHistory({ history }: { history: AccountBalance[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Balance history
      </p>
      {history.length === 0 ? (
        <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          No snapshots logged yet.
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between px-2 py-1.5 text-sm">
              <span className="text-muted-foreground">
                {format(parseISO(h.as_of_date), "MMM d, yyyy")}
              </span>
              <span className="tabular-nums font-medium">{formatMoney(Number(h.balance))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Every transaction linked to an account, capped then expandable — unlike
 * `RecentActivity`'s 5/25-tier preview, this is the account's full ledger.
 */
function AccountAllTransactions({
  rows,
  institutionById,
  transferTitleAccounts,
  onSelect,
}: {
  rows: Transaction[];
  institutionById: Record<string, Institution>;
  transferTitleAccounts: Record<string, { from: string; to: string }>;
  onSelect: (t: Transaction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: categories = [] } = useCategories();
  const entries = useMemo(() => groupLedgerRows(rows), [rows]);
  const [openSplits, setOpenSplits] = useState<Record<string, boolean>>({});

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        All transactions
      </p>
      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          No transactions yet.
        </p>
      ) : (
        <div className="rounded-md border">
          {(expanded ? entries : entries.slice(0, 20)).map((entry) => {
            const t = entry.head;
            return (
              <div
                key={entry.key}
                onClick={() => onSelect(t)}
                className="cursor-pointer border-b px-2 py-2 text-sm last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate">
                      <TransactionTitle
                        transaction={t}
                        placeName={t.institution_id ? institutionById[t.institution_id]?.name : null}
                        transferFromAccount={transferTitleAccounts[t.id]?.from}
                        transferToAccount={transferTitleAccounts[t.id]?.to}
                      />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(t.transaction_date), "MMM d, yyyy")}
                      {/* ADR-100: only worth a second date when it's set and differs. */}
                      {t.cleared_date && t.cleared_date !== t.transaction_date
                        ? ` · cleared ${format(parseISO(t.cleared_date), "MMM d, yyyy")}`
                        : ""}
                      {t.status === "pending" ? " · pending" : ""}
                      {entry.isSplit ? ` · split (${entry.rows.length})` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.transfer_group_id ? <Badge variant="outline">Transfer</Badge> : null}
                    <p
                      className={`tabular-nums font-medium ${
                        entry.total < 0 ? "" : "text-primary"
                      } ${t.status === "pending" ? "opacity-60" : ""}`}
                    >
                      {formatMoney(entry.total)}
                    </p>
                  </div>
                </div>
                {entry.isSplit ? (
                  <>
                    <button
                      className="mt-1 text-xs text-muted-foreground underline decoration-dotted"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenSplits((prev) => ({ ...prev, [entry.key]: !prev[entry.key] }));
                      }}
                    >
                      {openSplits[entry.key] ? "Hide breakdown" : "Show breakdown"}
                    </button>
                    {openSplits[entry.key] ? (
                      <div className="mt-1 divide-y divide-border/50 rounded-md border">
                        {entry.rows.map((line) => (
                          <div
                            key={line.id}
                            className="flex items-center justify-between px-2 py-1 text-xs"
                          >
                            <span className="truncate">
                              {categories.find((c) => c.id === line.category_id)?.name ??
                                "No category"}
                            </span>
                            <span className="tabular-nums">{formatMoney(Number(line.amount))}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
          {entries.length > 20 && !expanded ? (
            <button
              className="w-full px-2 py-2 text-xs text-muted-foreground underline decoration-dotted"
              onClick={() => setExpanded(true)}
            >
              Show all {entries.length} transactions
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Bank-statement style list of the most recent ledger rows for an account. */
function RecentActivity({
  rows,
  institutionById,
  transferTitleAccounts,
  onSelect,
}: {
  rows: Transaction[];
  institutionById: Record<string, Institution>;
  transferTitleAccounts: Record<string, { from: string; to: string }>;
  onSelect: (t: Transaction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: categories = [] } = useCategories();
  // ADR-044: split lines collapse into one entry with an expandable breakdown.
  const entries = useMemo(() => groupLedgerRows(rows), [rows]);
  const [openSplits, setOpenSplits] = useState<Record<string, boolean>>({});
  if (entries.length === 0) {
    return (
      <p className="mt-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        No transactions yet.
      </p>
    );
  }
  const shown = expanded ? entries.slice(0, 25) : entries.slice(0, 5);
  return (
    <div className="mt-2 rounded-md border">
      <p className="border-b px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
        Recent activity
      </p>
      {shown.map((entry) => {
        const t = entry.head;
        return (
          <div
            key={entry.key}
            onClick={() => onSelect(t)}
            className="cursor-pointer border-b px-2 py-2 text-sm last:border-b-0"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate">
                  <TransactionTitle
                    transaction={t}
                    placeName={t.institution_id ? institutionById[t.institution_id]?.name : null}
                    transferFromAccount={transferTitleAccounts[t.id]?.from}
                    transferToAccount={transferTitleAccounts[t.id]?.to}
                  />
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(t.transaction_date), "MMM d")}
                  {/* ADR-100: only worth a second date when it's set and differs. */}
                  {t.cleared_date && t.cleared_date !== t.transaction_date
                    ? ` · cleared ${format(parseISO(t.cleared_date), "MMM d")}`
                    : ""}
                  {t.status === "pending" ? " · pending" : ""}
                  {entry.isSplit ? ` · split (${entry.rows.length})` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.transfer_group_id ? (
                  <Badge variant="outline">Transfer</Badge>
                ) : null}
                <p
                  className={`tabular-nums font-medium ${
                    entry.total < 0 ? "" : "text-primary"
                  } ${t.status === "pending" ? "opacity-60" : ""}`}
                >
                  {formatMoney(entry.total)}
                </p>
              </div>
            </div>
            {entry.isSplit ? (
              <>
                <button
                  className="mt-1 text-xs text-muted-foreground underline decoration-dotted"
                  onClick={() =>
                    setOpenSplits((prev) => ({ ...prev, [entry.key]: !prev[entry.key] }))
                  }
                >
                  {openSplits[entry.key] ? "Hide breakdown" : "Show breakdown"}
                </button>
                {openSplits[entry.key] ? (
                  <div className="mt-1 divide-y divide-border/50 rounded-md border">
                    {entry.rows.map((line) => (
                      <div
                        key={line.id}
                        className="flex items-center justify-between px-2 py-1 text-xs"
                      >
                        <span className="truncate">
                          {categories.find((c) => c.id === line.category_id)?.name ?? "No category"}
                        </span>
                        <span className="tabular-nums">{formatMoney(Number(line.amount))}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        );
      })}
      {entries.length > 5 ? (
        <button
          className="w-full px-2 py-2 text-xs text-muted-foreground underline decoration-dotted"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : `Show more (${entries.length - 5} more)`}
        </button>
      ) : null}
    </div>
  );
}

function LogBalanceDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const log = useLogBalance();
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const open = account !== null;
  const [lastKey, setLastKey] = useState("");
  const key = account?.id ?? "";
  if (open && key !== lastKey) {
    setLastKey(key);
    setBalance("");
    setDate(format(new Date(), "yyyy-MM-dd"));
  }
  if (!open && lastKey !== "") setLastKey("");

  async function save() {
    if (!account) return;
    if (!balance) {
      toast.error("Enter a balance");
      return;
    }
    try {
      await log.mutateAsync({
        account_id: account.id,
        balance: Number(balance),
        as_of_date: date,
      });
      toast.success("Balance logged");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log balance{account ? ` — ${account.name}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Balance</Label>
            <Input
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="h-11"
            />
          </div>
          <div>
            <Label>As of date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={log.isPending} className="h-11 w-full">
            Save snapshot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
