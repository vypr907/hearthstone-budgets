import { createFileRoute } from "@tanstack/react-router";
import { AccountDialog } from "@/components/AccountDialog";
import { EmptyState } from "@/components/EmptyState";
import { SectionLabel } from "@/components/SectionLabel";
import { AppHeader } from "@/components/AppHeader";
import {
  useAccounts,
  useCategories,
  useInstitutions,
  useLatestBalances,
  useLogBalance,
  useTransactions,
} from "@/lib/data-hooks";
import { formatMoney } from "@/lib/format";
import { computeBalances } from "@/lib/balances";
import { groupLedgerRows } from "@/lib/split-groups";

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
import type { Account, Transaction } from "@/lib/supabase";
import { format } from "date-fns";
import { ObligationIcon, useInstitutionIndex } from "@/components/ObligationIcon";

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
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const [logging, setLogging] = useState<Account | null>(null);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "current" | "type">("name");
  const [typeFilter, setTypeFilter] = useState("all");
  const [instFilter, setInstFilter] = useState("all");

  const institutionById = useInstitutionIndex(institutions);


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
  }, [accounts, typeFilter, instFilter, q, sort, balances]);

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
              <Card key={a.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <ObligationIcon
                      institution={institutionById[a.institution_id ?? ""]}
                      name={`${a.name} ${a.account_type ?? ""}`}
                      fallback="🏛️"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.account_type || "Account"}
                        {b?.asOf
                          ? ` · snapshot ${format(new Date(b.asOf), "MMM d")}`
                          : " · starting balance"}
                      </p>

                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(a)}
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

                  <RecentActivity rows={recentByAccount[a.id] ?? []} />
                  <Button
                    variant="outline"
                    className="mt-2 h-10 w-full"
                    onClick={() => setLogging(a)}
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
    </>
  );
}

/** Bank-statement style list of the most recent ledger rows for an account. */
function RecentActivity({ rows }: { rows: Transaction[] }) {
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
          <div key={entry.key} className="border-b px-2 py-2 text-sm last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate">{t.description || "Transaction"}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(t.transaction_date), "MMM d")}
                  {t.status === "pending" ? " · pending" : ""}
                  {entry.isSplit ? ` · split (${entry.rows.length})` : ""}
                </p>
              </div>
              <p
                className={`shrink-0 tabular-nums font-medium ${
                  entry.total < 0 ? "" : "text-primary"
                } ${t.status === "pending" ? "opacity-60" : ""}`}
              >
                {formatMoney(entry.total)}
              </p>
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
