import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  useDebts,
  useDebtStrategySettings,
  useLockStrategy,
  useSaveDebtPriorityOrder,
  useSaveDebtStrategySettings,
  useTransactions,
  useUnlockStrategy,
} from "@/lib/data-hooks";
import {
  activeDebts,
  compareStrategies,
  formatMonths,
  strategyKeyOf,
  type StrategyKey,
} from "@/lib/debt-payoff";
import {
  applyLockedOrder,
  baselineComparison,
  comparisonLabel,
  computeBaseline,
  formatMonthYear,
  isStrategyLocked,
  lockedInputs,
} from "@/lib/strategy-lock";
import { formatMoney } from "@/lib/format";
import { move } from "@/lib/reorder";

export const Route = createFileRoute("/app/debt-strategy")({
  head: () => ({
    meta: [
      { title: "Debt Strategy — Hearthstone" },
      {
        name: "description",
        content:
          "Compare avalanche, snowball, and custom debt payoff plans for your household and pick an active strategy.",
      },
      { property: "og:title", content: "Debt Strategy — Hearthstone" },
      {
        property: "og:description",
        content:
          "Compare avalanche, snowball, and custom debt payoff plans for your household and pick an active strategy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DebtStrategyPage,
});

const STRATEGIES: { key: StrategyKey; label: string; hint: string }[] = [
  { key: "avalanche", label: "Avalanche", hint: "Highest interest rate first" },
  { key: "snowball", label: "Snowball", hint: "Lowest balance first" },
  { key: "custom", label: "Custom", hint: "Your priority order" },
];

function DebtStrategyPage() {
  const { data: debts = [] } = useDebts();
  const { data: transactions = [] } = useTransactions();
  const { data: settings } = useDebtStrategySettings();
  const save = useSaveDebtStrategySettings();
  const lock = useLockStrategy();
  const unlock = useUnlockStrategy();

  const [extra, setExtra] = useState("0");
  const [active, setActive] = useState<StrategyKey>("avalanche");

  useEffect(() => {
    if (!settings) return;
    setExtra(String(settings.extra_monthly_payment ?? 0));
    setActive(strategyKeyOf(settings.active_strategy));
  }, [settings]);

  // ADR-095: a locked plan freezes the three inputs and renders every
  // projection from the frozen order.
  const locked = isStrategyLocked(settings);
  const lockInputs = useMemo(() => lockedInputs(settings), [settings]);
  const cmp = useMemo(() => baselineComparison(settings, debts), [settings, debts]);

  const plan = useMemo(() => {
    const base = activeDebts(debts);
    return lockInputs ? applyLockedOrder(base, lockInputs.order) : base;
  }, [debts, lockInputs]);
  const extraNum = Number(extra) || 0;
  const comparison = useMemo(() => compareStrategies(plan, extraNum), [plan, extraNum]);

  // Payment history comes straight from the ledger — cleared debt transactions.
  const paidByDebt = useMemo(() => {
    const map = new Map<string, { count: number; total: number; last: string | null }>();
    for (const t of transactions) {
      if (!t.linked_debt_id || t.status !== "cleared") continue;
      const cur = map.get(t.linked_debt_id) ?? { count: 0, total: 0, last: null };
      cur.count += 1;
      cur.total += Math.abs(Number(t.amount || 0));
      if (!cur.last || t.transaction_date > cur.last) cur.last = t.transaction_date;
      map.set(t.linked_debt_id, cur);
    }
    return map;
  }, [transactions]);

  const onSave = async () => {
    try {
      await save.mutateAsync({
        active_strategy: active,
        extra_monthly_payment: extraNum,
      });
      toast.success("Strategy saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ADR-094: editable Custom payoff order. `order` is a list of debt ids; it is
  // re-seeded from the DB only when the debt SET changes (add / remove / pay
  // off), so a local reorder survives until saved.
  const savePriority = useSaveDebtPriorityOrder();
  const [order, setOrder] = useState<string[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const orderedIdsFromDb = useMemo(
    () => [...plan].sort((a, b) => a.priority - b.priority).map((d) => d.id),
    [plan],
  );
  useEffect(() => {
    setOrder((prev) => {
      const sameSet =
        prev.length === orderedIdsFromDb.length &&
        prev.every((id) => orderedIdsFromDb.includes(id));
      return sameSet ? prev : orderedIdsFromDb;
    });
    setOrderDirty(false);
  }, [orderedIdsFromDb]);
  const orderRows = order
    .map((id) => plan.find((d) => d.id === id))
    .filter((d): d is (typeof plan)[number] => !!d);
  function moveRow(i: number, dir: -1 | 1) {
    const next = move(order, i, dir);
    if (next !== order) {
      setOrder(next as string[]);
      setOrderDirty(true);
    }
  }
  async function onSaveOrder() {
    try {
      await savePriority.mutateAsync(order);
      setOrderDirty(false);
      toast.success("Payoff order saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // ADR-095: lock the current plan + snapshot the baseline projection.
  const onLock = async () => {
    const frozenOrder = order.length ? order : null;
    const base = computeBaseline(debts, {
      strategy: active,
      extra: extraNum,
      order: frozenOrder,
    });
    if (!base) {
      toast.error("Can't project a debt-free date for this plan yet.");
      return;
    }
    try {
      if (orderDirty) {
        await savePriority.mutateAsync(order);
        setOrderDirty(false);
      }
      await lock.mutateAsync({
        strategy: active,
        extra: extraNum,
        order: frozenOrder,
        baseline_debt_free_date: base.baseline_debt_free_date,
        baseline_total_interest: base.baseline_total_interest,
      });
      toast.success("Plan locked");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onUnlock = async () => {
    if (
      !window.confirm("Unlock this plan? Your baseline comparison is cleared until you lock again.")
    )
      return;
    try {
      await unlock.mutateAsync();
      toast.success("Plan unlocked");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const totalBalance = plan.reduce((s, d) => s + d.balance, 0);
  const totalMinimums = plan.reduce((s, d) => s + d.minimum, 0);

  return (
    <>
      <AppHeader title="Debt Strategy" />
      <div className="space-y-4 p-4">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Active debts</span>
              <span className="font-medium">{plan.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total balance</span>
              <span className="font-medium">{formatMoney(totalBalance)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monthly minimums</span>
              <span className="font-medium">{formatMoney(totalMinimums)}</span>
            </div>
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="extra">Extra monthly payment</Label>
              <Input
                id="extra"
                inputMode="decimal"
                className="h-12"
                value={extra}
                disabled={locked}
                onChange={(e) => setExtra(e.target.value)}
              />
              {locked ? (
                <p className="text-xs text-muted-foreground">
                  Frozen by your locked plan. Unlock below to change.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {locked && cmp ? (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Locked plan</h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    cmp.status === "ahead"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : cmp.status === "behind"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {comparisonLabel(cmp)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Locked strategy</p>
                  <p className="font-medium capitalize">
                    {lockInputs?.strategy}
                    {lockInputs && lockInputs.extra > 0
                      ? ` · +${formatMoney(lockInputs.extra)}/mo`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Locked on</p>
                  <p className="font-medium">
                    {settings?.strategy_locked_at
                      ? new Date(settings.strategy_locked_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Debt-free — plan</p>
                  <p className="font-medium">{formatMonthYear(cmp.baselineDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Debt-free — now</p>
                  <p className="font-medium">
                    {cmp.liveDate ? formatMonthYear(cmp.liveDate) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Interest — plan</p>
                  <p className="font-medium">{formatMoney(cmp.baselineInterest)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Interest — now</p>
                  <p className="font-medium">
                    {cmp.liveInterest != null ? formatMoney(cmp.liveInterest) : "—"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                &ldquo;Now&rdquo; recomputes from your locked inputs against today&rsquo;s balances,
                so real payments and adjustments move it.
              </p>
              <Button
                variant="outline"
                className="h-11 w-full"
                disabled={unlock.isPending}
                onClick={onUnlock}
              >
                Unlock plan
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <p className="px-1 text-xs text-muted-foreground">
          Cash advances are excluded from the payoff plan — they're short-term and repeat, so they'd
          distort it. Track them on the Debts screen. Non-monthly minimums are shown as their
          monthly equivalent.
        </p>

        {plan.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No active debts with a remaining balance yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-3 font-medium">Scenario</th>
                        {STRATEGIES.map((s) => (
                          <th key={s.key} className="p-3 text-right font-medium">
                            {s.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-3 text-muted-foreground">Debt-free in</td>
                        {STRATEGIES.map((s) => (
                          <td key={s.key} className="p-3 text-right font-medium">
                            {formatMonths(comparison[s.key].months)}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b">
                        <td className="p-3 text-muted-foreground">Total interest</td>
                        {STRATEGIES.map((s) => (
                          <td key={s.key} className="p-3 text-right font-medium">
                            {formatMoney(comparison[s.key].totalInterest)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-3 text-muted-foreground">Saved vs minimums</td>
                        {STRATEGIES.map((s) => (
                          <td key={s.key} className="p-3 text-right font-medium">
                            {formatMoney(comparison[s.key].saved)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <p className="px-1 text-xs text-muted-foreground">
              Swipe the table left to see the Custom column →
            </p>

            <p className="px-1 text-xs text-muted-foreground">
              Baseline: minimums only — {formatMonths(comparison.minimumsOnly.months)},{" "}
              {formatMoney(comparison.minimumsOnly.totalInterest)} interest.
            </p>

            <div className="grid grid-cols-1 gap-2">
              {STRATEGIES.map((s) => (
                <Button
                  key={s.key}
                  variant={active === s.key ? "default" : "outline"}
                  className="h-14 justify-between"
                  disabled={locked}
                  onClick={() => setActive(s.key)}
                >
                  <span className="text-left">
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-xs opacity-80">{s.hint}</span>
                  </span>
                  <span className="text-sm">{formatMonths(comparison[s.key].months)}</span>
                </Button>
              ))}
            </div>

            {locked ? (
              <p className="px-1 text-xs text-muted-foreground">
                Strategy is locked. Use <span className="font-medium">Unlock plan</span> above to
                switch strategies or change your extra payment.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                <Button className="h-12 w-full" disabled={save.isPending} onClick={onSave}>
                  Save strategy
                </Button>
                <Button
                  variant="outline"
                  className="h-12 w-full"
                  disabled={lock.isPending || plan.length === 0}
                  onClick={onLock}
                >
                  Lock this plan
                </Button>
                <p className="px-1 text-xs text-muted-foreground">
                  Locking freezes the strategy, extra payment and custom order, and records
                  today&rsquo;s projected debt-free date as your baseline to track against.
                </p>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold">Custom payoff order</h2>
                {orderDirty ? (
                  <span className="text-xs text-muted-foreground">unsaved changes</span>
                ) : null}
              </div>
              <p className="px-1 text-xs text-muted-foreground">
                Sets each debt's priority. Only used while the active strategy is Custom; new debts
                are added to the end.
                {locked ? " Frozen by your locked plan." : ""}
              </p>
              <div className="space-y-2">
                {orderRows.map((d, i) => (
                  <Card key={d.id}>
                    <CardContent className="flex items-center gap-2 p-3">
                      <span className="w-5 shrink-0 text-right text-sm font-semibold text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatMoney(d.balance)}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        disabled={i === 0 || savePriority.isPending || locked}
                        aria-label={`Move ${d.name} up`}
                        onClick={() => moveRow(i, -1)}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        disabled={i === orderRows.length - 1 || savePriority.isPending || locked}
                        aria-label={`Move ${d.name} down`}
                        onClick={() => moveRow(i, 1)}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button
                className="h-11 w-full"
                variant={orderDirty ? "default" : "outline"}
                disabled={!orderDirty || savePriority.isPending || locked}
                onClick={onSaveOrder}
              >
                Save order
              </Button>
            </div>

            <h2 className="px-1 pt-2 text-sm font-semibold">
              Payoff order — {STRATEGIES.find((s) => s.key === active)?.label}
            </h2>
            <div className="space-y-2">
              {comparison[active].perDebt.map((d, i) => {
                const hist = paidByDebt.get(d.id);
                return (
                  <Card key={d.id}>
                    <CardContent className="space-y-1 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-muted-foreground">
                          {i + 1}.
                        </span>
                        <span className="flex-1 font-medium">{d.name}</span>
                        <span className="text-sm">{formatMonths(d.months)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Interest {formatMoney(d.interest)}</span>
                        {d.usedKnownCharge && (
                          <Badge variant="secondary">Known finance charge</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {hist
                          ? `${hist.count} cleared payment${hist.count === 1 ? "" : "s"} · ${formatMoney(hist.total)} paid${hist.last ? ` · last ${hist.last}` : ""}`
                          : "No cleared payments yet"}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
