import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  useAccounts,
  useDeleteAccount,
  useInstitutions,
  useLatestBalances,
  useLogBalance,
  useTransactions,
  useUpsertAccount,
} from "@/lib/data-hooks";
import { formatMoney } from "@/lib/format";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Plus, Search, Trash2, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Account } from "@/lib/supabase";
import { format } from "date-fns";

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

  const institutionName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of institutions) m[i.id] = i.name;
    return m;
  }, [institutions]);

  const accountTypes = useMemo(
    () =>
      [...new Set(accounts.map((a) => a.account_type).filter(Boolean))].sort() as string[],
    [accounts],
  );

  /**
   * Anchor = latest account_balances snapshot, else starting_balance.
   * Current  = anchor + cleared transactions dated after the anchor.
   * Spendable = anchor + cleared AND pending transactions after the anchor.
   */
  const balances = useMemo(() => {
    const out: Record<string, { anchor: number; current: number; spendable: number; asOf: string | null }> = {};
    for (const a of accounts) {
      const snap = latest[a.id];
      const anchor = snap ? Number(snap.balance) : Number(a.starting_balance ?? 0);
      const since = snap ? snap.as_of_date.slice(0, 10) : null;
      let cleared = 0;
      let pending = 0;
      for (const t of transactions) {
        if (t.account_id !== a.id) continue;
        if (since && t.transaction_date.slice(0, 10) <= since) continue;
        if (t.status === "cleared") cleared += Number(t.amount || 0);
        else if (t.status === "pending") pending += Number(t.amount || 0);
      }
      out[a.id] = {
        anchor,
        current: anchor + cleared,
        spendable: anchor + cleared + pending,
        asOf: since,
      };
    }
    return out;
  }, [accounts, latest, transactions]);

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
        return (a.account_type ?? "").localeCompare(b.account_type ?? "") ||
          a.name.localeCompare(b.name);
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
            <CardContent className="p-4 text-sm text-muted-foreground">
              {accounts.length === 0 ? "No accounts yet." : "Nothing matches."}
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
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.account_type || "Account"}
                        {a.institution_id && institutionName[a.institution_id]
                          ? ` · ${institutionName[a.institution_id]}`
                          : ""}
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
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">Current</p>
                      <p className="font-semibold">{formatMoney(b?.current ?? 0)}</p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">Spendable</p>
                      <p className="font-semibold">{formatMoney(b?.spendable ?? 0)}</p>
                    </div>
                  </div>
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


function AccountDialog({
  account,
  onClose,
}: {
  account: Partial<Account> | null;
  onClose: () => void;
}) {
  const upsert = useUpsertAccount();
  const del = useDeleteAccount();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [starting, setStarting] = useState("");
  const [notes, setNotes] = useState("");

  const open = account !== null;
  const isEdit = !!account?.id;
  const key = account?.id ?? "new";
  const [lastKey, setLastKey] = useState("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(account?.name ?? "");
    setType(account?.account_type ?? "");
    setStarting(account?.starting_balance != null ? String(account.starting_balance) : "");
    setNotes(account?.notes ?? "");
  }
  if (!open && lastKey !== "") setLastKey("");

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: account?.id,
        name: name.trim(),
        account_type: type || null,
        starting_balance: starting ? Number(starting) : null,
        notes: notes || null,
      });
      toast.success(isEdit ? "Account updated" : "Account added");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!account?.id) return;
    if (!confirm("Delete this account?")) return;
    try {
      await del.mutateAsync(account.id);
      toast.success("Account deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit account" : "Add account"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </div>
          <div>
            <Label>Type</Label>
            <Input
              placeholder="Checking, savings, credit…"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-11"
            />
          </div>
          <div>
            <Label>Starting balance</Label>
            <Input
              type="number"
              step="0.01"
              value={starting}
              onChange={(e) => setStarting(e.target.value)}
              className="h-11"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
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
      </DialogContent>
    </Dialog>
  );
}

function LogBalanceDialog({
  account,
  onClose,
}: {
  account: Account | null;
  onClose: () => void;
}) {
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
