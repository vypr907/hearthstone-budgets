import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  useAccounts,
  useDeleteAccount,
  useLatestBalances,
  useLogBalance,
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
import { Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Account } from "@/lib/supabase";
import { format } from "date-fns";

export const Route = createFileRoute("/app/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const { data: accounts = [], isLoading } = useAccounts();
  const { data: latest = {} } = useLatestBalances();
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const [logging, setLogging] = useState<Account | null>(null);

  return (
    <>
      <AppHeader title="Accounts" />
      <div className="space-y-3 p-4">
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add account
        </Button>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && accounts.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No accounts yet.
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {accounts.map((a) => {
            const bal = latest[a.id];
            const value = bal ? Number(bal.balance) : Number(a.starting_balance ?? 0);
            return (
              <Card key={a.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.account_type || "Account"}
                        {bal ? ` · as of ${format(new Date(bal.as_of_date), "MMM d")}` : " · starting"}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold">{formatMoney(value)}</p>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(a)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
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
  const [loginUrl, setLoginUrl] = useState("");
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
    setLoginUrl(account?.login_url ?? "");
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
        login_url: loginUrl || null,
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
            <Label>Login URL</Label>
            <Input
              type="url"
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
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
