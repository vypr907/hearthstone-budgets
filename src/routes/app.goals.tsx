import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
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
import { EmojiIcon, ItemBar, ProgressRing, itemColor } from "@/components/viz";
import {
  useAccounts,
  useDeleteSavingsGoal,
  useSavingsGoals,
  useTransactions,
  useUpsertSavingsGoal,
  useUpsertTransaction,
} from "@/lib/data-hooks";
import { computeGoalBalances, daysRemaining, monthsRemaining } from "@/lib/balances";
import { formatMoney } from "@/lib/format";
import type { SavingsGoal } from "@/lib/supabase";

export const Route = createFileRoute("/app/goals")({
  head: () => ({
    meta: [
      { title: "Savings Goals — Hearthstone" },
      {
        name: "description",
        content:
          "Track household sinking funds: targets, progress, and how much to save each month.",
      },
      { property: "og:title", content: "Savings Goals — Hearthstone" },
      {
        property: "og:description",
        content:
          "Track household sinking funds: targets, progress, and how much to save each month.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GoalsPage,
});

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

function GoalsPage() {
  const { data: goals = [], isLoading, error } = useSavingsGoals();
  const { data: transactions = [] } = useTransactions();
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [move, setMove] = useState<{ goal: SavingsGoal; sign: 1 | -1 } | null>(null);

  const balances = useMemo(
    () => computeGoalBalances(goals.map((g) => g.id), transactions),
    [goals, transactions],
  );

  const total = goals.reduce((s, g) => s + (balances[g.id] ?? 0), 0);
  const targetTotal = goals.reduce((s, g) => s + Number(g.target_amount || 0), 0);

  return (
    <>
      <AppHeader title="Savings Goals" />
      <div className="space-y-3 p-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Saved</p>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(total)}</p>
              <p className="text-xs text-muted-foreground">
                of {formatMoney(targetTotal)} targeted
              </p>
            </div>
            <Button
              className="h-11"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              + New Goal
            </Button>
          </CardContent>
        </Card>

        {error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : null}
        {!isLoading && goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No savings goals yet. Create one to start a sinking fund.
          </p>
        ) : null}

        {goals.map((g, i) => {
          const current = balances[g.id] ?? 0;
          const target = Number(g.target_amount || 0);
          const pct = target > 0 ? (current / target) * 100 : 0;
          const months = monthsRemaining(g.target_date);
          const days = daysRemaining(g.target_date);
          const perMonth = months ? Math.max(0, target - current) / months : null;
          const color = itemColor(i);
          return (
            <Card key={g.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <EmojiIcon name={g.name} fallback={g.icon || "🏦"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{g.name}</p>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Target {formatMoney(target)}
                      {g.target_date ? ` · ${g.target_date.slice(0, 10)}` : ""}
                    </p>
                  </div>
                  <ProgressRing value={pct} color={color} />
                </div>

                <div className="flex items-end justify-between">
                  <p className="text-2xl font-bold tabular-nums">{formatMoney(current)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(Math.max(0, target - current))} to go
                  </p>
                </div>
                <ItemBar value={pct} color={color} />

                <p className="text-xs text-muted-foreground">
                  {days != null
                    ? `${days} day${Math.abs(days) === 1 ? "" : "s"} left`
                    : "No target date"}
                  {perMonth != null
                    ? ` · save ${formatMoney(perMonth)}/month to hit your target`
                    : ""}
                </p>

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    className="h-11"
                    onClick={() => setMove({ goal: g, sign: 1 })}
                  >
                    + Add
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={() => setMove({ goal: g, sign: -1 })}
                  >
                    − Withdraw
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11"
                    onClick={() => {
                      setEditing(g);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <GoalDialog
        key={editing?.id ?? "new"}
        goal={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
      <MoveDialog move={move} onClose={() => setMove(null)} />
    </>
  );
}

function GoalDialog({
  goal,
  open,
  onOpenChange,
}: {
  goal: SavingsGoal | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const save = useUpsertSavingsGoal();
  const remove = useDeleteSavingsGoal();
  const [name, setName] = useState(goal?.name ?? "");
  const [icon, setIcon] = useState(goal?.icon ?? "");
  const [amount, setAmount] = useState(goal ? String(goal.target_amount ?? "") : "");
  const [date, setDate] = useState(goal?.target_date?.slice(0, 10) ?? "");

  async function submit() {
    const n = Number(amount);
    if (!name.trim()) return toast.error("Name the goal");
    if (!amount || !Number.isFinite(n) || n <= 0) return toast.error("Enter a target amount");
    try {
      await save.mutateAsync({
        ...(goal?.id ? { id: goal.id } : {}),
        name: name.trim(),
        icon: icon.trim() || null,
        target_amount: n,
        target_date: date || null,
      });
      toast.success(goal ? "Goal updated" : "Goal created");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New savings goal"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="goal-name">Name</Label>
            <Input
              id="goal-name"
              className="h-12"
              placeholder="e.g. Emergency Fund"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-icon">Icon (emoji)</Label>
            <Input
              id="goal-icon"
              className="h-12"
              placeholder="🏖️"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-target">Target amount</Label>
            <Input
              id="goal-target"
              type="number"
              inputMode="decimal"
              step="0.01"
              className="h-12"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-date">Target date (optional)</Label>
            <Input
              id="goal-date"
              type="date"
              className="h-12"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {goal ? (
            <Button
              variant="ghost"
              className="h-12"
              disabled={remove.isPending}
              onClick={async () => {
                try {
                  await remove.mutateAsync(goal.id);
                  toast.success("Goal deleted");
                  onOpenChange(false);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Delete
            </Button>
          ) : null}
          <Button className="h-12 flex-1" disabled={save.isPending} onClick={submit}>
            Save goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Quick add/withdraw — same manual-entry shape as the FAB, but linked to a goal. */
function MoveDialog({
  move,
  onClose,
}: {
  move: { goal: SavingsGoal; sign: 1 | -1 } | null;
  onClose: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const save = useUpsertTransaction();
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const adding = move?.sign === 1;

  async function submit() {
    if (!move) return;
    if (!accountId) return toast.error("Pick an account");
    const n = Number(amount);
    if (!amount || !Number.isFinite(n) || n <= 0) return toast.error("Enter an amount");
    try {
      await save.mutateAsync({
        account_id: accountId,
        amount: move.sign * Math.abs(n),
        linked_goal_id: move.goal.id,
        description: description.trim() || (adding ? `Into ${move.goal.name}` : `From ${move.goal.name}`),
        status: "cleared",
        transaction_date: todayISO(),
      });
      qc.invalidateQueries({ queryKey: ["latest_balances"] });
      toast.success(adding ? "Added to goal" : "Withdrawn from goal");
      setAccountId("");
      setAmount("");
      setDescription("");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={!!move} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {adding ? "Add to" : "Withdraw from"} {move?.goal.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-12">
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
          <div className="space-y-2">
            <Label htmlFor="goal-move-amount">Amount</Label>
            <Input
              id="goal-move-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              className="h-12"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-move-desc">Description</Label>
            <Input
              id="goal-move-desc"
              className="h-12"
              placeholder="Optional note"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button className="h-12 w-full" disabled={save.isPending} onClick={submit}>
            {adding ? "Add to goal" : "Withdraw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
