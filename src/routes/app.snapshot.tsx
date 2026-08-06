import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import {
  useAccounts,
  useBills,
  useDebts,
  useHousehold,
  useLatestBalances,
  useTransactions,
} from "@/lib/data-hooks";
import { useIncomeEvents, useIncomeSources } from "@/lib/income-hooks";
import { useLedgerState } from "@/lib/ledger-state";
import { formatMoney } from "@/lib/format";
import { EmojiIcon, ItemBar, ProgressRing, itemColor } from "@/components/viz";
import { computeBalances } from "@/lib/balances";
import { eventDate, periodRange } from "@/lib/paycheck-budget";
import {
  buildSnapshot,
  exportSnapshot,
  formatDayLabel,
  todayISO,
  topByAmount,
  SNAPSHOT_MAX_ROWS,
  buildBalanceSubtotals,
  buildPeriodProgress,
  buildSnapshotSummary,
  type SnapshotRow,
} from "@/lib/snapshot";


export const Route = createFileRoute("/app/snapshot")({
  head: () => ({
    meta: [
      { title: "Status Snapshot — Hearthstone" },
      {
        name: "description",
        content:
          "A one-page snapshot of overdue bills, upcoming obligations, and the next paycheck.",
      },
      { property: "og:title", content: "Status Snapshot — Hearthstone" },
      {
        property: "og:description",
        content:
          "A one-page snapshot of overdue bills, upcoming obligations, and the next paycheck.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SnapshotPage,
});

function Row({ row, index, accent }: { row: SnapshotRow; index: number; accent?: boolean }) {
  const days = Math.abs(row.daysDiff);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <EmojiIcon
        name={row.name}
        fallback={row.kind === "debt" ? "🏦" : "🧾"}
        className={accent ? "bg-destructive/10" : undefined}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{row.name}</p>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {accent
            ? `${days} day${days === 1 ? "" : "s"} overdue`
            : `${formatDayLabel(row.dueDate)} · in ${days} day${days === 1 ? "" : "s"}`}
        </p>
        <ItemBar
          value={accent ? 100 : Math.max(8, 100 - days * 7)}
          color={accent ? "var(--destructive)" : itemColor(index)}
          className="mt-1.5"
        />
      </div>
      <p
        className={`text-base font-bold tabular-nums ${accent ? "text-destructive" : "text-foreground"}`}
      >
        {formatMoney(row.amount)}
      </p>
    </div>
  );
}

function MoreNote({ count, tone }: { count: number; tone: "overdue" | "upcoming" }) {
  if (count <= 0) return null;
  return (
    <p
      className={`pt-2 text-[11px] font-semibold uppercase tracking-wide ${
        tone === "overdue" ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      +{count} more {tone} — see full list in app.
    </p>
  );
}


function SnapshotPage() {
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const { data: household } = useHousehold();
  const { data: sources = [] } = useIncomeSources();
  const { data: events = [] } = useIncomeEvents();
  const { data: accounts = [] } = useAccounts();
  const { data: latest = {} } = useLatestBalances();
  const { data: transactions = [] } = useTransactions();
  const stateOf = useLedgerState();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const snap = useMemo(() => buildSnapshot(bills, debts, stateOf), [bills, debts, stateOf]);
  const overdueTop = useMemo(() => topByAmount(snap.overdue), [snap.overdue]);
  const upcomingTop = snap.upcoming.slice(0, SNAPSHOT_MAX_ROWS);
  const grandTotal = snap.overdueTotal + snap.upcomingTotal;
  const overduePct = grandTotal > 0 ? (snap.overdueTotal / grandTotal) * 100 : 0;


  const nextPaycheck = useMemo(() => {
    const primaryIds = new Set(
      sources.filter((s) => s.is_primary).map((s) => s.id),
    );
    const today = todayISO();
    return events
      .filter(
        (e) =>
          e.income_source_id &&
          primaryIds.has(e.income_source_id) &&
          (e.expected_date ?? "").slice(0, 10) >= today,
      )
      .sort((a, b) => (a.expected_date ?? "").localeCompare(b.expected_date ?? ""))[0];
  }, [events, sources]);

  const balances = useMemo(
    () => computeBalances(accounts, latest, transactions),
    [accounts, latest, transactions],
  );
  const balanceSummary = useMemo(
    () => buildBalanceSubtotals(accounts, balances),
    [accounts, balances],
  );

  /** Current pay period, falling back to the calendar month (ADR-034). */
  const period = useMemo(() => {
    const today = todayISO();
    const primary = sources.find((s) => s.is_primary) ?? null;
    const primaryEvents = events
      .filter((e) => primary && e.income_source_id === primary.id)
      .sort((a, b) => (eventDate(a) ?? "").localeCompare(eventDate(b) ?? ""));
    const current = [...primaryEvents]
      .reverse()
      .find((e) => (eventDate(e) ?? "") <= today);
    const range = current ? periodRange(current, primaryEvents) : null;
    if (range) return { ...range, label: "pay period" };
    const d = new Date();
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    return { start, end, label: "month" };
  }, [sources, events]);

  const progress = useMemo(
    () => buildPeriodProgress(bills, debts, period),
    [bills, debts, period],
  );

  const summary = useMemo(
    () =>
      buildSnapshotSummary({
        snapshot: snap,
        progress,
        spendableTotal: balanceSummary.spendableTotal,
      }),
    [snap, progress, balanceSummary.spendableTotal],
  );

  const format = household?.export_format === "pdf" ? "pdf" : "png";

  async function onExport() {
    if (!nodeRef.current) return;
    setBusy(true);
    try {
      await exportSnapshot(nodeRef.current, format);
      toast.success(`Snapshot saved as ${format.toUpperCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  const now = new Date();

  return (
    <>
      <AppHeader title="Status Snapshot" />
      <div className="space-y-3 p-4">
        <Button className="h-12 w-full" onClick={onExport} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export as {format.toUpperCase()}
        </Button>

        <div
          ref={nodeRef}
          className="space-y-3 rounded-2xl bg-background p-3"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <Card
            className="border-0 text-brand-foreground"
            style={{ background: "var(--gradient-brand)", boxShadow: "var(--shadow-card)" }}
          >
            <CardContent className="flex items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                  Status Snapshot
                </p>
                <h2 className="truncate text-2xl font-bold tracking-tight">
                  {household?.name || "Household"}
                </h2>
                <p className="text-xs opacity-80">
                  {now.toLocaleString("en-US", {
                    dateStyle: "full",
                    timeStyle: "short",
                  })}
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums">
                  {formatMoney(snap.overdueTotal + snap.upcomingTotal)}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                  Due now + next 14 days
                </p>
              </div>
              <ProgressRing
                value={overduePct}
                size={56}
                color="var(--destructive)"
                label={`${Math.round(overduePct)}% of the total is overdue`}
              />
            </CardContent>
          </Card>

          {snap.overdue.length > 0 && (
            <Card
              className="border-2 border-destructive/40 bg-destructive/5"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <CardContent className="p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
                    Overdue
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-destructive">
                    {formatMoney(snap.overdueTotal)}
                  </p>
                </div>
                <p className="text-sm font-bold text-destructive">
                  {formatMoney(snap.overdueTotal)} overdue across {snap.overdue.length} item
                  {snap.overdue.length === 1 ? "" : "s"}
                </p>
                <div className="mt-1 divide-y divide-destructive/15">
                  {overdueTop.map((r, i) => (
                    <Row key={`${r.kind}-${r.id}`} row={r} index={i} accent />
                  ))}
                </div>
                <MoreNote count={snap.overdue.length - overdueTop.length} tone="overdue" />
              </CardContent>
            </Card>
          )}

          <Card style={{ boxShadow: "var(--shadow-card)" }}>
            <CardContent className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Next 14 days · {snap.upcoming.length}
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {formatMoney(snap.upcomingTotal)}
                </p>
              </div>
              {snap.upcoming.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nothing due in the next two weeks.
                </p>
              ) : (
                <>
                  <div className="mt-1 divide-y divide-border/40">
                    {upcomingTop.map((r, i) => (
                      <Row key={`${r.kind}-${r.id}`} row={r} index={i} />
                    ))}
                  </div>
                  <MoreNote count={snap.upcoming.length - upcomingTop.length} tone="upcoming" />
                </>
              )}
            </CardContent>
          </Card>


          <Card style={{ boxShadow: "var(--shadow-card)" }}>
            <CardContent className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Balances
                </p>
                <p className="text-2xl font-bold tabular-nums text-primary">
                  {formatMoney(balanceSummary.spendableTotal)}
                </p>
              </div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Combined spendable
              </p>
              {balanceSummary.rows.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No accounts yet.</p>
              ) : (
                <div className="mt-2 divide-y divide-border/40">
                  {balanceSummary.rows.map((r) => (
                    <div key={r.type} className="flex items-center justify-between py-1.5">
                      <p className="text-sm font-semibold">{r.label}</p>
                      <p className="text-sm font-bold tabular-nums">{formatMoney(r.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card style={{ boxShadow: "var(--shadow-card)" }}>
            <CardContent className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  This {progress.label}
                </p>
                <p className="text-sm font-bold tabular-nums">
                  {Math.round(progress.pct)}% covered
                </p>
              </div>
              <ItemBar value={progress.pct} color="var(--primary)" className="mt-2" />
              <div className="mt-2 flex items-baseline justify-between text-sm">
                <p className="font-semibold text-muted-foreground">
                  Paid {formatMoney(progress.paid)}
                </p>
                <p className="font-bold tabular-nums">
                  {formatMoney(progress.owed)} still owed
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ boxShadow: "var(--shadow-card)" }}>
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Summary
              </p>
              <p className="mt-1 text-sm leading-relaxed">{summary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Next paycheck
              </p>
              {nextPaycheck ? (
                <div className="mt-1 flex items-baseline justify-between">
                  <p className="text-sm font-semibold">
                    {formatDayLabel((nextPaycheck.expected_date ?? "").slice(0, 10))}
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-primary">
                    {formatMoney(Number(nextPaycheck.expected_amount ?? 0))}
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No upcoming primary paycheck scheduled.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
