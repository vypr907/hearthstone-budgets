import type { Account, Bill, Debt } from "./supabase";
import { debtDueDate } from "./format";
import type { LedgerState } from "./ledger-state";
import {
  billCycleDue,
  billRemainingOwed,
  debtCycleDue,
  debtRemainingOwed,
  toPayable,
} from "./payments";
import { obligationsInRange } from "./paycheck-budget";
import { spendableContribution, type AccountBalanceInfo } from "./balances";

export type SnapshotRow = {
  kind: "bill" | "debt";
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  daysDiff: number;
};

export function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86400000);
}

/** Amount owed for a bill this cycle: cycle_amount_due wins when set. */
function billAmount(b: Bill) {
  const due = b.cycle_amount_due == null ? null : Number(b.cycle_amount_due);
  return due && due > 0 ? due : Number(b.amount || 0);
}

/**
 * ADR-028: split every open obligation into overdue vs. the next 14 days.
 * Anything cleared for its current cycle (ledger-derived) drops out.
 */
export function buildSnapshot(
  bills: Bill[],
  debts: Debt[],
  stateOf: (p: ReturnType<typeof toPayable>) => LedgerState,
  windowDays = 14,
) {
  const today = todayISO();
  const rows: SnapshotRow[] = [];

  for (const b of bills) {
    if (b.is_active === false) continue;
    if (stateOf(toPayable("bill", b)) === "cleared") continue;
    const due = b.next_due_date ? b.next_due_date.slice(0, 10) : null;
    if (!due) continue;
    rows.push({
      kind: "bill",
      id: b.id,
      name: b.name,
      amount: billAmount(b),
      dueDate: due,
      daysDiff: daysBetween(today, due),
    });
  }

  for (const d of debts) {
    if (d.date_paid_off) continue;
    if (stateOf(toPayable("debt", d)) === "cleared") continue;
    const due = debtDueDate(d);
    if (!due) continue;
    rows.push({
      kind: "debt",
      id: d.id,
      name: d.name,
      amount: Number(d.minimum_payment || 0),
      dueDate: due,
      daysDiff: daysBetween(today, due),
    });
  }

  const overdue = rows
    .filter((r) => r.daysDiff < 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcoming = rows
    .filter((r) => r.daysDiff >= 0 && r.daysDiff <= windowDays)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    today,
    overdue,
    upcoming,
    overdueTotal: overdue.reduce((s, r) => s + r.amount, 0),
    upcomingTotal: upcoming.reduce((s, r) => s + r.amount, 0),
  };
}

export function formatDayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** One-page cap: how many individual rows each section may render. */
export const SNAPSHOT_MAX_ROWS = 5;

/** Top N rows by dollar amount (used for the overdue section). */
export function topByAmount(rows: SnapshotRow[], n = SNAPSHOT_MAX_ROWS) {
  return [...rows].sort((a, b) => b.amount - a.amount).slice(0, n);
}

/**
 * One canvas render, two encodings (ADR-028). PNG downloads directly; PDF
 * pipes the same canvas into a single-page jsPDF sized to the image.
 */
export async function exportSnapshot(node: HTMLElement, format: "png" | "pdf") {
  const { default: html2canvas } = await import("html2canvas-pro");

  // Clone the node and render it at a fixed (0,0) origin so
  // foreignObjectRendering captures the full width without scroll/position drift.
  const clone = node.cloneNode(true) as HTMLElement;
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.top = "0";
  wrapper.style.left = "0";
  wrapper.style.width = `${node.offsetWidth}px`;
  wrapper.style.height = `${node.offsetHeight}px`;
  wrapper.style.zIndex = "-9999";
  wrapper.style.overflow = "hidden";
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      foreignObjectRendering: true,
      width: clone.offsetWidth,
      height: clone.offsetHeight,
      windowWidth: clone.offsetWidth,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      backgroundColor: getComputedStyle(node).backgroundColor || "#ffffff",
    });
  } finally {
    document.body.removeChild(wrapper);
  }

  const stamp = todayISO();

  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [canvas.width, canvas.height],
    });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`hearthstone-snapshot-${stamp}.pdf`);
    return;
  }

  const link = document.createElement("a");
  link.download = `hearthstone-snapshot-${stamp}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

/* ------------------------------------------------------------------ */
/* ADR-028 additions: balances, pay-period progress, text summary      */
/* ------------------------------------------------------------------ */

export type BalanceSubtotal = { type: string; label: string; total: number };

const BALANCE_TYPE_ORDER = [
  "checking",
  "savings",
  "credit",
  "invest",
  "retirement",
  "hsa",
  "lpfsa",
];

const typeLabel = (t: string) =>
  t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Per-account-type subtotals plus the combined spendable total (ADR-023).
 * Uses the same balances.ts formula the Accounts screen renders.
 */
export function buildBalanceSubtotals(
  accounts: Account[],
  balances: Record<string, AccountBalanceInfo>,
) {
  const totals = new Map<string, number>();
  let spendableTotal = 0;
  for (const a of accounts) {
    const b = balances[a.id]?.spendable ?? Number(a.starting_balance ?? 0);
    const type = (a.account_type ?? "other").trim().toLowerCase();
    totals.set(type, (totals.get(type) ?? 0) + b);
    const contribution = spendableContribution(a, b);
    if (contribution != null) spendableTotal += contribution;
  }
  const rows: BalanceSubtotal[] = [...totals.entries()]
    .map(([type, total]) => ({ type, label: typeLabel(type), total }))
    .sort((x, y) => {
      const ix = BALANCE_TYPE_ORDER.indexOf(x.type);
      const iy = BALANCE_TYPE_ORDER.indexOf(y.type);
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.label.localeCompare(y.label);
    });
  return { rows, spendableTotal };
}

export type PeriodProgress = {
  label: string;
  start: string;
  end: string;
  total: number;
  paid: number;
  owed: number;
  pct: number;
};

/**
 * Progress through the current pay period (or month): of everything due in
 * range, how much is already covered vs. still owed. Reuses the ADR-035
 * remaining-owed helpers so partial payments count proportionally.
 */
export function buildPeriodProgress(
  bills: Bill[],
  debts: Debt[],
  period: { start: string; end: string; label: string },
): PeriodProgress {
  const rows = obligationsInRange(bills, debts, period.start, period.end);
  const billById = new Map(bills.map((b) => [b.id, b]));
  const debtById = new Map(debts.map((d) => [d.id, d]));
  let total = 0;
  let owed = 0;
  for (const o of rows) {
    if (o.kind === "bill") {
      const b = billById.get(o.id);
      if (!b) continue;
      total += billCycleDue(b);
      owed += Math.max(0, billRemainingOwed(b));
    } else {
      const d = debtById.get(o.id);
      if (!d) continue;
      total += debtCycleDue(d);
      owed += Math.max(0, debtRemainingOwed(d));
    }
  }
  const paid = Math.max(0, total - owed);
  return {
    label: period.label,
    start: period.start,
    end: period.end,
    total,
    paid,
    owed,
    pct: total > 0 ? Math.min(100, (paid / total) * 100) : 0,
  };
}

/**
 * ADR-028: rule-based plain-text summary of the snapshot. Deliberately
 * isolated (pure string templates, no network) so it can be swapped for an
 * LLM-generated version later without touching the rest of the snapshot.
 */
export function buildSnapshotSummary(input: {
  snapshot: ReturnType<typeof buildSnapshot>;
  progress: PeriodProgress;
  spendableTotal: number;
}): string {
  const { snapshot, progress, spendableTotal } = input;
  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const lines: string[] = [];

  const obligations = snapshot.overdueTotal + snapshot.upcomingTotal;
  if (obligations <= 0) {
    lines.push("Nothing is due right now or in the next two weeks.");
  } else {
    const gap = spendableTotal - obligations;
    if (gap >= 0) {
      lines.push(
        `${money(obligations)} is due through the next 14 days, covered by ${money(
          spendableTotal,
        )} spendable — ${money(gap)} left over.`,
      );
    } else {
      lines.push(
        `${money(obligations)} is due through the next 14 days but only ${money(
          spendableTotal,
        )} is spendable — short by ${money(Math.abs(gap))}.`,
      );
    }
  }

  if (snapshot.overdue.length > 0) {
    const worst = [...snapshot.overdue].sort((a, b) => a.daysDiff - b.daysDiff)[0];
    lines.push(
      `${snapshot.overdue.length} item${snapshot.overdue.length === 1 ? "" : "s"} overdue (${money(
        snapshot.overdueTotal,
      )}), oldest is ${worst.name} at ${Math.abs(worst.daysDiff)} day${
        Math.abs(worst.daysDiff) === 1 ? "" : "s"
      } past due.`,
    );
  } else {
    lines.push("Nothing is overdue.");
  }

  if (progress.total > 0) {
    lines.push(
      `This ${progress.label} is ${Math.round(progress.pct)}% covered — ${money(
        progress.paid,
      )} handled, ${money(progress.owed)} still owed.`,
    );
  } else {
    lines.push(`Nothing is scheduled for this ${progress.label}.`);
  }

  if (spendableTotal > obligations * 1.5 && obligations > 0) {
    lines.push("Comfortable surplus — there's room to put extra toward savings or debt.");
  }

  return lines.join(" ");
}
