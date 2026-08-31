import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { PlacePicker } from "@/components/PlacePicker";
import { EmptyState } from "@/components/EmptyState";
import {
  useAccounts,
  useBills,
  useCategories,
  useDebts,
  useInstitutions,
  useTransactions,
  useUpsertTransaction,
} from "@/lib/data-hooks";
import { internalTransferIds } from "@/lib/internal-transfers";
import { accountLabel, formatMoney } from "@/lib/format";
import type { Transaction } from "@/lib/supabase";

export const Route = createFileRoute("/app/fix-places")({
  head: () => ({
    meta: [
      { title: "Fix Places — Hearthstone" },
      {
        name: "description",
        content:
          "Assign a place to household transactions that were saved without one, so spending by place stays accurate.",
      },
      { property: "og:title", content: "Fix Places — Hearthstone" },
      {
        property: "og:description",
        content:
          "Assign a place to household transactions that were saved without one, so spending by place stays accurate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FixPlacesPage,
});

/**
 * ADR-053/063 repair scan: transactions written before merchants existed (or
 * saved in a hurry) have no institution_id, so they never show up in Spending
 * by Place. Same visual pattern as the ADR-037 stranded-payment repair card.
 */
function FixPlacesPage() {
  const { data: transactions = [] } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const save = useUpsertTransaction();

  const { data: categories = [] } = useCategories();
  const { data: institutions = [] } = useInstitutions();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();

  const accountName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of accounts) m[a.id] = accountLabel(a);
    return m;
  }, [accounts]);

  const nameOf = useMemo(() => {
    const cat: Record<string, string> = {};
    for (const c of categories as { id: string; name: string }[]) cat[c.id] = c.name;
    const inst: Record<string, string> = {};
    for (const i of institutions as { id: string; name: string }[]) inst[i.id] = i.name;
    const bill: Record<string, string> = {};
    for (const b of bills as { id: string; name: string }[]) bill[b.id] = b.name;
    const debt: Record<string, string> = {};
    for (const d of debts as { id: string; name: string }[]) debt[d.id] = d.name;
    return { cat, inst, bill, debt };
  }, [categories, institutions, bills, debts]);

  /** ADR-090: sibling lines give a split row the context its own fields lack. */
  const siblings = useMemo(() => {
    const m: Record<string, Transaction[]> = {};
    for (const t of transactions as Transaction[]) {
      const gid = t.split_group_id ?? t.transfer_group_id;
      if (!gid) continue;
      (m[gid] ||= []).push(t);
    }
    return m;
  }, [transactions]);

  /**
   * Internal (two-sided) transfers move money between the household's own
   * accounts (ADR-056/089) — there is no merchant to assign, so they stay out.
   * Everything else that spends money without a place is fixable, including
   * split lines (ADR-044), which are ordinary purchases and often happen at
   * different places than the rest of their group, and one-sided transfer legs,
   * where the money really did leave the household.
   */
  const unassigned = useMemo(() => {
    const internal = internalTransferIds(transactions);
    return transactions.filter(
      (t: Transaction) =>
        !t.institution_id &&
        !(t.transfer_group_id && internal.has(t.transfer_group_id)) &&
        Number(t.amount ?? 0) < 0,
    );
  }, [transactions]);

  async function assign(t: Transaction, institutionId: string | null) {
    if (!institutionId) return;
    try {
      await save.mutateAsync({ id: t.id, amount: Number(t.amount), institution_id: institutionId });
      toast.success("Place assigned");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <AppHeader title="Fix Places" />
      <div className="space-y-3 p-4">
        {unassigned.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Every transaction has a place
              </div>
              <EmptyState>Nothing to fix right now.</EmptyState>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-amber-500/40">
              <CardContent className="flex items-start gap-2 p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="text-sm">
                  <p className="font-semibold">
                    {unassigned.length} transaction{unassigned.length === 1 ? "" : "s"} without a
                    place
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Assign a place so this spending shows up under Spending by Place. You can search
                    existing places or add a new one inline.
                  </p>
                </div>
              </CardContent>
            </Card>

            {unassigned.map((t) => {
              const gid = t.split_group_id ?? t.transfer_group_id ?? null;
              const group = gid ? (siblings[gid] ?? []) : [];
              const others = group.filter((g) => g.id !== t.id);
              const groupTotal = group.reduce((s, g) => s + Math.abs(Number(g.amount ?? 0)), 0);
              const linked =
                (t.linked_bill_id && nameOf.bill[t.linked_bill_id]) ||
                (t.linked_debt_id && nameOf.debt[t.linked_debt_id]) ||
                null;
              const category = t.category_id ? nameOf.cat[t.category_id] : null;
              const title =
                t.description ||
                (linked ? `Payment · ${linked}` : null) ||
                (category ? `${category} purchase` : null) ||
                (others.find((o) => o.description)?.description
                  ? `Part of: ${others.find((o) => o.description)!.description}`
                  : "(no description)");
              return (
              <Card key={t.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.transaction_date}
                        {t.account_id && accountName[t.account_id]
                          ? ` · ${accountName[t.account_id]}`
                          : ""}
                        {t.status ? ` · ${t.status}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {category ? `Category: ${category}` : "No category"}
                        {linked ? ` · ${linked}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(Math.abs(Number(t.amount ?? 0)))}
                    </span>
                  </div>

                  {others.length > 0 && (
                    <div className="rounded-md border border-border/60 bg-muted/30 p-2">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        {t.split_group_id ? "Split" : "Transfer"} of{" "}
                        {formatMoney(groupTotal)} · {group.length} lines
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {others.slice(0, 4).map((o) => (
                          <li
                            key={o.id}
                            className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                          >
                            <span className="truncate">
                              {o.description ||
                                (o.linked_debt_id && nameOf.debt[o.linked_debt_id]) ||
                                (o.linked_bill_id && nameOf.bill[o.linked_bill_id]) ||
                                (o.category_id && nameOf.cat[o.category_id]) ||
                                "line"}
                              {o.institution_id && nameOf.inst[o.institution_id]
                                ? ` @ ${nameOf.inst[o.institution_id]}`
                                : ""}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {formatMoney(Math.abs(Number(o.amount ?? 0)))}
                            </span>
                          </li>
                        ))}
                        {others.length > 4 && (
                          <li className="text-[11px] text-muted-foreground">
                            +{others.length - 4} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                  <PlacePicker
                    value={null}
                    onChange={(id) => void assign(t, id)}
                    compact
                    label="Place"
                  />
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </>
  );
}
