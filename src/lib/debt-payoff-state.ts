import type { Debt } from "./supabase";

export const EFFECTIVELY_ZERO_BALANCE = 0.005;

function localTodayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * ADR-066 addendum: every non-Advance debt balance write also synchronizes
 * date_paid_off. Advances are reusable and intentionally exempt.
 */
export function debtPayoffDatePatch(
  debt: Pick<Debt, "debt_type" | "date_paid_off">,
  nextBalance: number,
  effectiveDate?: string | null,
): { date_paid_off?: string | null } {
  if ((debt.debt_type ?? "").toLowerCase() === "advance") return {};
  if (nextBalance <= EFFECTIVELY_ZERO_BALANCE) {
    return { date_paid_off: debt.date_paid_off ?? effectiveDate?.slice(0, 10) ?? localTodayISO() };
  }
  return debt.date_paid_off ? { date_paid_off: null } : {};
}