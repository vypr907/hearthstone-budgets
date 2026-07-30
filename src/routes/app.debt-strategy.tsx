import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  useDebts,
  useDebtStrategySettings,
  useSaveDebtStrategySettings,
  useTransactions,
} from "@/lib/data-hooks";
import {
  activeDebts,
  compareStrategies,
  formatMonths,
  type StrategyKey,
} from "@/lib/debt-payoff";
import { formatMoney } from "@/lib/format";

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

  const [extra, setExtra] = useState("0");
  const [active, setActive] = useState<StrategyKey>("avalanche");

  useEffect(() => {
    if (!settings) return;
    setExtra(String(settings.extra_monthly_payment ?? 0));
    const s = (settings.active_strategy ?? "").toLowerCase();
    if (s === "avalanche" || s === "snowball" || s === "custom") setActive(s);
  }, [settings]);

  const plan = useMemo(() => activeDebts(debts), [debts]);
  const extraNum = Number(extra) || 0;
  const comparison = useMemo(
    () => compareStrategies(plan, extraNum),
    [plan, extraNum],
  );

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
                onChange={(e) => setExtra(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

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
              Baseline: minimums only — {formatMonths(comparison.minimumsOnly.months)},{" "}
              {formatMoney(comparison.minimumsOnly.totalInterest)} interest.
            </p>

            <div className="grid grid-cols-1 gap-2">
              {STRATEGIES.map((s) => (
                <Button
                  key={s.key}
                  variant={active === s.key ? "default" : "outline"}
                  className="h-14 justify-between"
                  onClick={() => setActive(s.key)}
                >
                  <span className="text-left">
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-xs opacity-80">{s.hint}</span>
                  </span>
                  <span className="text-sm">
                    {formatMonths(comparison[s.key].months)}
                  </span>
                </Button>
              ))}
            </div>

            <Button className="h-12 w-full" disabled={save.isPending} onClick={onSave}>
              Save strategy
            </Button>

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
