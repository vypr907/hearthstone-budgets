import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  useInstitutions,
  useAccounts,
  useLatestBalances,
  useCategories,
  useInstitutionCategories,
  useBills,
  useDebts,
  useTransactions,
} from "@/lib/data-hooks";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { computeBalances, computeInstitutionTotals } from "@/lib/balances";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { Institution } from "@/lib/supabase";
import { DetailGrid, DetailItem, DetailText } from "@/components/detail";
import { InstitutionLogo } from "@/components/InstitutionLogo";
import { formatTypeLabel } from "@/lib/visual-meta";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { InstitutionDialog } from "@/components/InstitutionDialog";

export const Route = createFileRoute("/app/institutions")({
  head: () => ({
    meta: [
      { title: "Institutions — Hearthstone" },
      {
        name: "description",
        content:
          "Keep every bank, lender, and biller your household uses, with login links and their accounts.",
      },
      { property: "og:title", content: "Institutions — Hearthstone" },
      {
        property: "og:description",
        content:
          "Keep every bank, lender, and biller your household uses, with login links and their accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InstitutionsPage,
});

function InstitutionsPage() {
  const { data: institutions = [], isLoading } = useInstitutions();
  const { data: categories = [] } = useCategories();
  const { data: instCats = {} } = useInstitutionCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: latest = {} } = useLatestBalances();
  const { data: transactions = [] } = useTransactions();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const balances = computeBalances(accounts, latest, transactions);
  const categoryName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const [editing, setEditing] = useState<Partial<Institution> | null>(null);
  const [detail, setDetail] = useState<Institution | null>(null);
  const [groupBy, setGroupBy] = useState<"none" | "type" | "category">("none");

  // UI-only grouping: an institution with several categories appears under each.
  const groups: Array<{ key: string; label: string; rows: Institution[] }> = (() => {
    if (groupBy === "none") return [{ key: "all", label: "", rows: institutions }];
    const map = new Map<string, { label: string; rows: Institution[] }>();
    for (const i of institutions) {
      const keys: Array<[string, string]> =
        groupBy === "type"
          ? [[i.institution_type?.trim() || "__none__", formatTypeLabel(i.institution_type)]]
          : (instCats[i.id] ?? []).length
            ? (instCats[i.id] ?? []).map((cid) => [cid, categoryName[cid] ?? "Category"])
            : [["__none__", "No category"]];
      for (const [k, label] of keys) {
        if (!map.has(k)) map.set(k, { label, rows: [] });
        map.get(k)!.rows.push(i);
      }
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })();

  return (
    <>
      <AppHeader title="Institutions" />
      <div className="space-y-3 p-4">
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add institution
        </Button>

        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Group by</Label>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
            <SelectTrigger className="h-11 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="type">Type</SelectItem>
              <SelectItem value="category">Category</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && institutions.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No institutions yet.
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              {g.label ? (
                <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {g.label}
                </p>
              ) : null}
              {g.rows.map((i) => {
                const totals = computeInstitutionTotals(i.id, accounts, balances, bills, debts);
                return (
                  <Card key={i.id} className="cursor-pointer" onClick={() => setDetail(i)}>
                    <CardContent className="flex items-start gap-3 p-3">
                      <InstitutionLogo logoUrl={i.logo_url} type={i.institution_type} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{i.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatTypeLabel(i.institution_type)}
                          {i.sign_in_with_google ? " · Google sign-in" : ""}
                        </p>
                        {(instCats[i.id] ?? []).length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(instCats[i.id] ?? []).map((cid) => (
                              <Badge key={cid} variant="secondary" className="text-[10px]">
                                {categoryName[cid] ?? "Category"}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        {i.description ? (
                          <p className="truncate text-xs text-muted-foreground">{i.description}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold">
                          {totals.currentBalance == null ? "—" : formatMoney(totals.currentBalance)}
                        </p>
                        {totals.currentDue != null ? (
                          <p className="text-xs text-muted-foreground">
                            Due {formatMoney(totals.currentDue)}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(i);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <InstitutionDialog institution={editing} onClose={() => setEditing(null)} />
      <InstitutionDetail
        institution={detail}
        onClose={() => setDetail(null)}
        onEdit={(i) => {
          setDetail(null);
          setEditing(i);
        }}
      />
    </>
  );
}

function InstitutionDetail({
  institution,
  onClose,
  onEdit,
}: {
  institution: Institution | null;
  onClose: () => void;
  onEdit: (i: Institution) => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: latest = {} } = useLatestBalances();
  const { data: categories = [] } = useCategories();
  const { data: instCats = {} } = useInstitutionCategories();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const { data: transactions = [] } = useTransactions();
  const balances = computeBalances(accounts, latest, transactions);
  if (!institution) return null;
  const totals = computeInstitutionTotals(institution.id, accounts, balances, bills, debts);
  const catIds = instCats[institution.id] ?? [];
  const catNames = categories.filter((c) => catIds.includes(c.id));
  const linked = accounts.filter((a) => a.institution_id === institution.id);
  const linkedBills = bills.filter((b) => b.institution_id === institution.id);
  const linkedDebts = debts.filter((d) => d.institution_id === institution.id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <InstitutionLogo
              logoUrl={institution.logo_url}
              type={institution.institution_type}
              size={32}
            />
            {institution.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <DetailGrid>
            <DetailItem label="Type" value={formatTypeLabel(institution.institution_type)} />
            <DetailItem
              label="Sign in with Google"
              value={institution.sign_in_with_google ? "Yes" : "No"}
            />
            <DetailItem label="Login username" value={institution.login_username ?? "—"} />
            <DetailItem
              label="Login URL"
              value={
                institution.login_url ? (
                  <a
                    href={institution.login_url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-primary underline"
                  >
                    Open
                  </a>
                ) : (
                  "—"
                )
              }
            />
          </DetailGrid>
          <DetailGrid>
            <DetailItem
              label="Current balance"
              value={totals.currentBalance == null ? "—" : formatMoney(totals.currentBalance)}
            />
            <DetailItem
              label="Current due"
              value={totals.currentDue == null ? "—" : formatMoney(totals.currentDue)}
            />
          </DetailGrid>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Categories
            </p>
            {catNames.length === 0 ? (
              <p className="text-sm text-muted-foreground">No categories.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {catNames.map((c) => (
                  <Badge key={c.id} variant="secondary">
                    {c.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DetailText label="Description" value={institution.description} />
          <DetailText label="Notes" value={institution.notes} />

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Accounts
            </p>
            {linked.length === 0 && (
              <p className="text-sm text-muted-foreground">No accounts linked.</p>
            )}
            <div className="space-y-2">
              {linked.map((a) => {
                const bal = latest[a.id];
                const value = bal ? Number(bal.balance) : Number(a.starting_balance ?? 0);
                return (
                  <Card key={a.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.account_type || "Account"}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">{formatMoney(value)}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bills
            </p>
            {linkedBills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bills linked.</p>
            ) : (
              <div className="space-y-2">
                {linkedBills.map((b) => (
                  <Card key={b.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <p className="min-w-0 flex-1 truncate font-medium">{b.name}</p>
                      <p className="shrink-0 font-semibold">{formatMoney(Number(b.amount ?? 0))}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Debts
            </p>
            {linkedDebts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No debts linked.</p>
            ) : (
              <div className="space-y-2">
                {linkedDebts.map((d) => (
                  <Card key={d.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Min {formatMoney(Number(d.minimum_payment ?? 0))}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">
                        {formatMoney(Number(d.remaining_balance ?? 0))}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onEdit(institution)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Button>
          <Button className="h-11" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
