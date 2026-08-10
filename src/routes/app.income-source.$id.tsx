import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState } from "@/components/EmptyState";
import { SectionLabel } from "@/components/SectionLabel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useAccounts } from "@/lib/data-hooks";
import {
  useDeleteIncomeSourceSplit,
  useIncomeEvents,
  useIncomeSources,
  useIncomeSourceSplits,
  useUpsertIncomeSource,
  useUpsertIncomeSourceSplit,
} from "@/lib/income-hooks";
import { eventAmount, eventDate, isReceived } from "@/lib/paycheck-budget";
import { formatDate, formatMoney } from "@/lib/format";
import type { IncomeSourceSplit } from "@/lib/supabase";

export const Route = createFileRoute("/app/income-source/$id")({
  head: () => ({
    meta: [
      { title: "Income Source — Hearthstone" },
      {
        name: "description",
        content:
          "Pay history, income totals, and how each paycheck from this source splits across your accounts.",
      },
      { property: "og:title", content: "Income Source — Hearthstone" },
      {
        property: "og:description",
        content:
          "Pay history, income totals, and how each paycheck from this source splits across your accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IncomeSourceDetailPage,
});

const CADENCES = ["weekly", "biweekly", "semimonthly", "monthly", "irregular"];

/** Whole months spanned by the received history, floor 1, for the average. */
function monthsSpanned(dates: string[]): number {
  if (dates.length === 0) return 1;
  const sorted = [...dates].sort();
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const months =
    (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 +
    (Number(last.slice(5, 7)) - Number(first.slice(5, 7))) +
    1;
  return Math.max(1, months);
}

function IncomeSourceDetailPage() {
  const { id } = useParams({ from: "/app/income-source/$id" });
  const { data: sources = [], isLoading } = useIncomeSources();
  const { data: events = [] } = useIncomeEvents();
  const source = sources.find((s) => s.id === id) ?? null;

  const stats = useMemo(() => {
    const mine = events.filter((e) => e.income_source_id === id);
    const received = mine.filter(isReceived);
    const year = String(new Date().getFullYear());
    const total = received.reduce((sum, e) => sum + eventAmount(e), 0);
    const ytd = received
      .filter((e) => (eventDate(e) ?? "").startsWith(year))
      .reduce((sum, e) => sum + eventAmount(e), 0);
    const dates = received.map(eventDate).filter((d): d is string => !!d);
    const upcoming = mine
      .filter((e) => !isReceived(e))
      .sort((a, b) => (eventDate(a) ?? "").localeCompare(eventDate(b) ?? ""))[0];
    return {
      events: mine,
      received,
      total,
      ytd,
      monthlyAverage: total / monthsSpanned(dates),
      upcoming,
    };
  }, [events, id]);

  if (isLoading) {
    return (
      <>
        <AppHeader title="Income source" />
        <main className="mx-auto max-w-lg space-y-4 p-4">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      </>
    );
  }

  if (!source) {
    return (
      <>
        <AppHeader title="Income source" />
        <main className="mx-auto max-w-lg space-y-4 p-4">
          <EmptyState
            icon="💸"
            title="Income source not found"
            description="It may have been deleted."
          />
          <Link to="/app/paycheck">
            <Button variant="outline" className="h-11 w-full">
              Back to Paycheck Budget
            </Button>
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader title={source.name} />
      <main className="mx-auto max-w-lg space-y-4 p-4 pb-28">
        <Link
          to="/app/paycheck"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Paycheck Budget
        </Link>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">{source.name}</h1>
                <p className="text-xs text-muted-foreground">
                  {source.cadence ?? "cadence unset"} ·{" "}
                  {formatMoney(Number(source.typical_amount ?? 0))} typical
                </p>
              </div>
              {source.is_primary ? <Badge>Primary</Badge> : null}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="This year" value={formatMoney(stats.ytd)} />
              <Stat label="All time" value={formatMoney(stats.total)} />
              <Stat label="Monthly avg" value={formatMoney(stats.monthlyAverage)} />
            </div>
            {stats.upcoming ? (
              <p className="text-xs text-muted-foreground">
                Next expected {formatDate(eventDate(stats.upcoming))} ·{" "}
                {formatMoney(eventAmount(stats.upcoming))}
              </p>
            ) : null}
            <EditSourceButton sourceId={source.id} />
          </CardContent>
        </Card>

        <SplitsCard sourceId={source.id} />

        <Card>
          <CardContent className="space-y-2 p-4">
            <SectionLabel>Pay dates</SectionLabel>
            {stats.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pay dates recorded for this source yet.
              </p>
            ) : (
              [...stats.events]
                .sort((a, b) => (eventDate(b) ?? "").localeCompare(eventDate(a) ?? ""))
                .map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-0"
                  >
                    <span className="flex items-center gap-2">
                      {formatDate(eventDate(e))}
                      {isReceived(e) ? (
                        <Badge variant="secondary">Received</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">expected</span>
                      )}
                    </span>
                    <span className="font-medium">{formatMoney(eventAmount(e))}</span>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-muted/50 p-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

/** Rename, re-cadence, or re-prime the source without leaving the detail view. */
function EditSourceButton({ sourceId }: { sourceId: string }) {
  const { data: sources = [] } = useIncomeSources();
  const source = sources.find((s) => s.id === sourceId);
  const save = useUpsertIncomeSource();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState("biweekly");
  const [typical, setTypical] = useState("");
  const [primary, setPrimary] = useState(false);

  function start() {
    setName(source?.name ?? "");
    setCadence(source?.cadence ?? "biweekly");
    setTypical(source?.typical_amount != null ? String(source.typical_amount) : "");
    setPrimary(source?.is_primary === true);
    setOpen(true);
  }

  async function submit() {
    if (!name.trim()) return toast.error("Name is required");
    try {
      await save.mutateAsync({
        id: sourceId,
        name: name.trim(),
        cadence,
        typical_amount: typical ? Number(typical) : null,
        is_primary: primary,
      });
      toast.success("Income source saved");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Button variant="outline" className="h-11 w-full" onClick={start}>
        Edit source
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit income source</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
            </div>
            <div>
              <Label>Cadence</Label>
              <Select value={cadence} onValueChange={setCadence}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Typical amount</Label>
              <Input
                type="number"
                step="0.01"
                value={typical}
                onChange={(e) => setTypical(e.target.value)}
                className="h-11"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={primary}
                onChange={(e) => setPrimary(e.target.checked)}
              />
              Primary source (drives the paycheck budget)
            </label>
          </div>
          <DialogFooter>
            <Button className="h-11 w-full" disabled={save.isPending} onClick={submit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * ADR-054: the deposit splits are now editable here. Marking a paycheck
 * received (ADR-047) writes one ledger row per split, so this is where a
 * multi-account paycheck — checking, savings, HSA, retirement — is described.
 */
function SplitsCard({ sourceId }: { sourceId: string }) {
  const { data: splits = [] } = useIncomeSourceSplits(sourceId);
  const { data: accounts = [] } = useAccounts();
  const save = useUpsertIncomeSourceSplit(sourceId);
  const del = useDeleteIncomeSourceSplit(sourceId);
  const [editing, setEditing] = useState<Partial<IncomeSourceSplit> | null>(null);

  const accountName = (aid: string | null | undefined) =>
    accounts.find((a) => a.id === aid)?.name ?? "Unassigned account";

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Deposit splits</SectionLabel>
          <Button
            size="sm"
            className="h-9"
            onClick={() =>
              setEditing({
                income_source_id: sourceId,
                split_type: "fixed",
                sort_order: splits.length,
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
        {splits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No splits yet — a received paycheck will ask which account to deposit into.
          </p>
        ) : (
          splits.map((s) => (
            <div key={s.id} className="flex items-center gap-2 py-1 text-sm">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setEditing(s)}
                type="button"
              >
                <span className="block truncate">{accountName(s.account_id)}</span>
                <span className="text-xs text-muted-foreground">
                  {(s.split_type ?? "fixed").toLowerCase() === "remainder"
                    ? "Remainder of the paycheck"
                    : formatMoney(Number(s.amount ?? 0))}
                  {s.day_offset ? ` · +${s.day_offset}d` : ""}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Delete split"
                onClick={() => void del.mutateAsync(s.id).catch((e) => toast.error(e.message))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </CardContent>

      <SplitDialog
        sourceId={sourceId}
        split={editing}
        onClose={() => setEditing(null)}
        onSave={async (row) => {
          try {
            await save.mutateAsync(row);
            toast.success("Split saved");
            setEditing(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </Card>
  );
}

function SplitDialog({
  sourceId,
  split,
  onClose,
  onSave,
}: {
  sourceId: string;
  split: Partial<IncomeSourceSplit> | null;
  onClose: () => void;
  onSave: (row: Partial<IncomeSourceSplit> & { income_source_id: string }) => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const [accountId, setAccountId] = useState("");
  const [type, setType] = useState("fixed");
  const [amount, setAmount] = useState("");
  const [offset, setOffset] = useState("");
  const key = split?.id ?? (split ? "new" : "");
  const [lastKey, setLastKey] = useState("");
  if (split && key !== lastKey) {
    setLastKey(key);
    setAccountId(split.account_id ?? "");
    setType((split.split_type ?? "fixed").toLowerCase());
    setAmount(split.amount != null ? String(split.amount) : "");
    setOffset(split.day_offset != null ? String(split.day_offset) : "");
  }
  if (!split && lastKey !== "") setLastKey("");

  function submit() {
    if (!accountId) return toast.error("Pick an account");
    if (type !== "remainder" && !Number(amount)) return toast.error("Enter an amount");
    onSave({
      ...(split?.id ? { id: split.id } : {}),
      income_source_id: sourceId,
      account_id: accountId,
      split_type: type,
      amount: type === "remainder" ? null : Number(amount),
      day_offset: offset ? Number(offset) : null,
      sort_order: split?.sort_order ?? 0,
    });
  }

  return (
    <Dialog open={split !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{split?.id ? "Edit split" : "Add split"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Pick an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Split type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed amount</SelectItem>
                <SelectItem value="remainder">Remainder</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === "remainder" ? (
            <p className="text-xs text-muted-foreground">
              Whatever is left of the paycheck after the fixed splits lands here.
            </p>
          ) : (
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11"
              />
            </div>
          )}
          <div>
            <Label>Days after pay date (optional)</Label>
            <Input
              type="number"
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              className="h-11"
            />
          </div>
        </div>
        <DialogFooter>
          <Button className="h-11 w-full" onClick={submit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
