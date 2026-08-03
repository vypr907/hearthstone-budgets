import type { Bill, Debt } from "./supabase";
import { debtDueDate } from "./format";
import type { LedgerState } from "./ledger-state";
import { toPayable } from "./payments";

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
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    foreignObjectRendering: true,
    width: node.offsetWidth,
    height: node.offsetHeight,
    windowWidth: node.offsetWidth,
    x: 0,
    y: 0,
    scrollX: 0,
    scrollY: 0,
    backgroundColor: getComputedStyle(node).backgroundColor || "#ffffff",
  });

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
