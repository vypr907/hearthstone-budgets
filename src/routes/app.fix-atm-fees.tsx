import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAccounts,
  useInstitutions,
  useLinkTransferFee,
  useTransactions,
} from "@/lib/data-hooks";
import { findUnlinkedAtmFeeCandidates } from "@/lib/atm-fee-repair";
import { accountLabel, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/app/fix-atm-fees")({
  head: () => ({
    meta: [
      { title: "Fix ATM Fees — Hearthstone" },
      {
        name: "description",
        content:
          "Link a standalone ATM-fee transaction to the cash-withdrawal transfer it belongs to.",
      },
      { property: "og:title", content: "Fix ATM Fees — Hearthstone" },
      {
        property: "og:description",
        content:
          "Link a standalone ATM-fee transaction to the cash-withdrawal transfer it belongs to.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FixAtmFeesPage,
});

/** Per-fee dismissals survive reloads — "not a match" should stay answered. */
const DISMISS_KEY = "hearthstone.atm_fee_repair.dismissed";

function readDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * ADR-110 repair scan: a standalone, unlinked, placed small expense that
 * plausibly belongs to an unlinked Cash-destination transfer (the
 * ATM-withdrawal shape). Links it via `useLinkTransferFee` — never
 * auto-applied, always a user confirm. Also the ongoing mechanism for newly
 * bank-synced pairs, which arrive with no awareness of this app's linking
 * convention.
 */
function FixAtmFeesPage() {
  const { data: transactions = [] } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: institutions = [] } = useInstitutions();
  const link = useLinkTransferFee();

  const accountName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of accounts) m[a.id] = accountLabel(a);
    return m;
  }, [accounts]);
  const institutionName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of institutions) m[i.id] = i.name;
    return m;
  }, [institutions]);

  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const dismiss = (feeId: string) => {
    const next = [...new Set([...dismissed, feeId])];
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — the in-memory dismissal still applies */
    }
  };

  const candidates = useMemo(
    () =>
      findUnlinkedAtmFeeCandidates(transactions, accounts).filter(
        (c) => !dismissed.includes(c.feeTransaction.id),
      ),
    [transactions, accounts, dismissed],
  );

  /** Which candidate transfer is selected per fee, when there's more than one. */
  const [selected, setSelected] = useState<Record<string, string>>({});

  async function confirm(feeId: string, transferGroupId: string) {
    try {
      await link.mutateAsync({ feeTransactionId: feeId, transferGroupId });
      toast.success("Linked — the transfer now shows this place instead of the account names");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <AppHeader title="Fix ATM Fees" />
      <div className="space-y-3 p-4">
        {candidates.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                No unlinked ATM fees found
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
                    {candidates.length} possible ATM fee{candidates.length === 1 ? "" : "s"} to link
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Each of these is a standalone fee transaction that looks like it belongs to a
                    nearby cash withdrawal. Confirm the right withdrawal (if there's more than one
                    option) or skip if it's not a match — nothing is linked automatically.
                  </p>
                </div>
              </CardContent>
            </Card>

            {candidates.map(({ feeTransaction: fee, candidateTransfers }) => {
              const chosen = selected[fee.id] ?? candidateTransfers[0].transferGroupId;
              const chosenMatch =
                candidateTransfers.find((c) => c.transferGroupId === chosen) ??
                candidateTransfers[0];
              return (
                <Card key={fee.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {fee.institution_id ? institutionName[fee.institution_id] : "Fee"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fee.transaction_date}
                          {fee.account_id && accountName[fee.account_id]
                            ? ` · ${accountName[fee.account_id]}`
                            : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatMoney(Math.abs(Number(fee.amount ?? 0)))}
                      </span>
                    </div>

                    <div className="rounded-md border border-border/60 bg-muted/30 p-2">
                      <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                        {candidateTransfers.length === 1
                          ? "Matches this withdrawal:"
                          : `${candidateTransfers.length} possible withdrawals — pick one:`}
                      </p>
                      {candidateTransfers.length === 1 ? (
                        <p className="text-xs">
                          {formatMoney(Math.abs(Number(chosenMatch.fromLeg.amount)))} from{" "}
                          {accountName[chosenMatch.fromLeg.account_id ?? ""] ?? "—"} on{" "}
                          {chosenMatch.fromLeg.transaction_date}
                        </p>
                      ) : (
                        <Select
                          value={chosen}
                          onValueChange={(v) => setSelected((prev) => ({ ...prev, [fee.id]: v }))}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {candidateTransfers.map((c) => (
                              <SelectItem key={c.transferGroupId} value={c.transferGroupId}>
                                {formatMoney(Math.abs(Number(c.fromLeg.amount)))} from{" "}
                                {accountName[c.fromLeg.account_id ?? ""] ?? "—"} on{" "}
                                {c.fromLeg.transaction_date}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => dismiss(fee.id)}>
                        Skip
                      </Button>
                      <Button
                        size="sm"
                        disabled={link.isPending}
                        onClick={() => confirm(fee.id, chosenMatch.transferGroupId)}
                      >
                        <Link2 className="mr-2 h-4 w-4" /> Confirm
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
