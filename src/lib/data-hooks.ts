import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  supabase,
  type Bill,
  type Debt,
  type Account,
  type AccountBalance,
  type Category,
  type Institution,
  type InstitutionCategory,
  type Transaction,
  type SpendingBudget,
  type SpendingActual,
  type DebtStrategySettings,
  type SavingsGoal,
  type Household,
  type ExportFormat,
} from "./supabase";
import { advanceDate } from "./format";
import { useAuth } from "./auth-context";

export function useCategories() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["categories", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("household_id", householdId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}


export function useBills() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["bills", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Bill[]> => {
      const { data, error } = await supabase
        .from("bills")
        .select("*")
        .eq("household_id", householdId!)
        .order("next_due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Bill[];
    },
  });
}

export function useDebts() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["debts", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Debt[]> => {
      const { data, error } = await supabase
        .from("debts")
        .select("*")
        .eq("household_id", householdId!)
        .order("priority_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Debt[];
    },
  });
}

export function useAccounts() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["accounts", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("household_id", householdId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });
}

export function useAccountBalances(accountId?: string) {
  return useQuery({
    queryKey: ["account_balances", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<AccountBalance[]> => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("*")
        .eq("account_id", accountId!)
        .order("as_of_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AccountBalance[];
    },
  });
}

export function useLatestBalances() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["latest_balances", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Record<string, AccountBalance | undefined>> => {
      const { data: accts } = await supabase
        .from("accounts")
        .select("id")
        .eq("household_id", householdId!);
      if (!accts || accts.length === 0) return {};
      const ids = accts.map((a) => a.id);
      const { data, error } = await supabase
        .from("account_balances")
        .select("*")
        .in("account_id", ids)
        .order("as_of_date", { ascending: false });
      if (error) throw error;
      const out: Record<string, AccountBalance> = {};
      for (const b of (data ?? []) as AccountBalance[]) {
        if (!out[b.account_id]) out[b.account_id] = b;
      }
      return out;
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useUpsertBill() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bill: Partial<Bill> & { name: string; amount: number }) => {
      const payload = { ...bill, household_id: householdId };
      if (bill.id) {
        const { error } = await supabase.from("bills").update(payload).eq("id", bill.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bills").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bills"] }),
  });
}

export function useDeleteBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bills").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bills"] }),
  });
}

export function useUpsertDebt() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (debt: Partial<Debt> & { name: string }) => {
      const payload = { ...debt, household_id: householdId };
      if (debt.id) {
        const { error } = await supabase.from("debts").update(payload).eq("id", debt.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("debts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debts"] }),
  });
}

export function useDeleteDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("debts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debts"] }),
  });
}

export function useSetPaymentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kind,
      id,
      status,
    }: {
      kind: "bill" | "debt";
      id: string;
      status: string;
    }) => {
      const table = kind === "bill" ? "bills" : "debts";
      const { error } = await supabase
        .from(table)
        .update({ payment_status: status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["debts"] });
    },
  });
}

/**
 * Clearing a bill rolls it into its next cycle: mark cleared, advance
 * next_due_date by the bill's billing_cycle, then reset to unpaid.
 */
export function useClearBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bill: Bill) => {
      const { error: e1 } = await supabase
        .from("bills")
        .update({ payment_status: "cleared" })
        .eq("id", bill.id);
      if (e1) throw e1;

      const base = bill.next_due_date ?? new Date().toISOString().slice(0, 10);
      const next = advanceDate(base, bill.billing_cycle);
      const { error: e2 } = await supabase
        .from("bills")
        .update({ payment_status: "unpaid", next_due_date: next })
        .eq("id", bill.id);
      if (e2) throw e2;
      return next;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bills"] }),
  });
}

/** Debts are always monthly, so they still get a simple bulk reset. */
export function useResetDebtsMonth() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("debts")
        .update({ payment_status: "unpaid" })
        .eq("household_id", householdId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debts"] }),
  });
}


export function useUpsertAccount() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Partial<Account> & { name: string }) => {
      const payload = { ...a, household_id: householdId };
      if (a.id) {
        const { error } = await supabase.from("accounts").update(payload).eq("id", a.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["latest_balances"] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["latest_balances"] });
    },
  });
}

export function useLogBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      account_id,
      balance,
      as_of_date,
    }: {
      account_id: string;
      balance: number;
      as_of_date: string;
    }) => {
      const { error } = await supabase
        .from("account_balances")
        .insert({ account_id, balance, as_of_date });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["account_balances", vars.account_id] });
      qc.invalidateQueries({ queryKey: ["latest_balances"] });
    },
  });
}

/* ---------------- Institutions ---------------- */

export function useInstitutions() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["institutions", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Institution[]> => {
      const { data, error } = await supabase
        .from("institutions")
        .select("*")
        .eq("household_id", householdId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Institution[];
    },
  });
}

export function useUpsertInstitution() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: Partial<Institution> & { name: string }) => {
      const payload = { ...i, household_id: householdId };
      if (i.id) {
        const { error } = await supabase.from("institutions").update(payload).eq("id", i.id);
        if (error) throw error;
        return i.id;
      }
      const { data, error } = await supabase
        .from("institutions")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["institutions"] }),
  });
}

export function useDeleteInstitution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("institutions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["institutions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

/* ---------------- Transactions ---------------- */

export function useTransactions() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["transactions", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("household_id", householdId!)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}

export function useUpsertTransaction() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<Transaction> & { amount: number }) => {
      const payload = { ...t, household_id: householdId };
      if (t.id) {
        const { error } = await supabase.from("transactions").update(payload).eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transactions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  });
}

/** Only manual (unlinked) transactions may be deleted — linked rows keep
 * bill/debt payment_status in sync with the ledger. */
export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Transaction) => {
      if (t.linked_bill_id || t.linked_debt_id) {
        throw new Error("Linked transactions can't be deleted");
      }
      const { error } = await supabase.from("transactions").delete().eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  });
}

/* ---------------- Institution categories (join table) ---------------- */

/** Map of institution_id -> category_id[] from the institution_categories join table. */
export function useInstitutionCategories() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["institution_categories", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data: insts } = await supabase
        .from("institutions")
        .select("id")
        .eq("household_id", householdId!);
      const ids = (insts ?? []).map((i) => i.id);
      if (ids.length === 0) return {};
      const { data, error } = await supabase
        .from("institution_categories")
        .select("institution_id,category_id")
        .in("institution_id", ids);
      if (error) throw error;
      const out: Record<string, string[]> = {};
      for (const r of (data ?? []) as InstitutionCategory[]) {
        (out[r.institution_id] ??= []).push(r.category_id);
      }
      return out;
    },
  });
}

/** Sync an institution's categories: insert added rows, delete removed ones. */
export function useSetInstitutionCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      institutionId,
      categoryIds,
    }: {
      institutionId: string;
      categoryIds: string[];
    }) => {
      const { data, error } = await supabase
        .from("institution_categories")
        .select("category_id")
        .eq("institution_id", institutionId);
      if (error) throw error;
      const current = new Set((data ?? []).map((r) => r.category_id as string));
      const next = new Set(categoryIds);
      const toAdd = categoryIds.filter((c) => !current.has(c));
      const toRemove = [...current].filter((c) => !next.has(c));
      if (toAdd.length) {
        const { error: e } = await supabase
          .from("institution_categories")
          .insert(toAdd.map((category_id) => ({ institution_id: institutionId, category_id })));
        if (e) throw e;
      }
      if (toRemove.length) {
        const { error: e } = await supabase
          .from("institution_categories")
          .delete()
          .eq("institution_id", institutionId)
          .in("category_id", toRemove);
        if (e) throw e;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["institution_categories"] }),
  });
}

/* ---------------------------- Spending ---------------------------- */

/** ISO first-of-month for a given date (defaults to today). */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Shift an ISO first-of-month key by n months. */
export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKey(d);
}

export function useSpendingBudgets() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["spending_budgets", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<SpendingBudget[]> => {
      const { data, error } = await supabase
        .from("spending_budgets")
        .select("*")
        .eq("household_id", householdId!);
      if (error) throw error;
      return (data ?? []) as SpendingBudget[];
    },
  });
}

export function useSpendingActuals() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["spending_actuals", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<SpendingActual[]> => {
      const { data, error } = await supabase
        .from("spending_actuals")
        .select("*")
        .eq("household_id", householdId!)
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SpendingActual[];
    },
  });
}

/** Create or update the budgeted amount for a category. */
export function useUpsertSpendingBudget() {
  const qc = useQueryClient();
  const { householdId } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      categoryId,
      amount,
      description,
    }: {
      id?: string;
      categoryId: string;
      amount: number;
      description?: string | null;
    }) => {
      if (id) {
        const { error } = await supabase
          .from("spending_budgets")
          .update({
            budgeted_amount: amount,
            ...(description !== undefined ? { description: description || null } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("spending_budgets").insert({
        household_id: householdId!,
        category_id: categoryId,
        budgeted_amount: amount,
        ...(description !== undefined ? { description: description || null } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spending_budgets"] }),
  });
}

/** Create or update the actual spend for a category in a given month. */
export function useUpsertSpendingActual() {
  const qc = useQueryClient();
  const { householdId } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      categoryId,
      month,
      amount,
    }: {
      id?: string;
      categoryId: string;
      month: string;
      amount: number;
    }) => {
      if (id) {
        const { error } = await supabase
          .from("spending_actuals")
          .update({ actual_amount: amount })
          .eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("spending_actuals").insert({
        household_id: householdId!,
        category_id: categoryId,
        month,
        actual_amount: amount,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spending_actuals"] }),
  });
}

/**
 * Start a new month: existing rows stay untouched (that's the history), and a
 * fresh zeroed actuals row is opened for each budget item in the next month.
 */
export function useStartNewSpendingMonth() {
  const qc = useQueryClient();
  const { householdId } = useAuth();
  return useMutation({
    mutationFn: async ({
      nextMonth,
      categoryIds,
    }: {
      nextMonth: string;
      categoryIds: string[];
    }) => {
      const { data, error } = await supabase
        .from("spending_actuals")
        .select("category_id")
        .eq("household_id", householdId!)
        .eq("month", nextMonth);
      if (error) throw error;
      const existing = new Set((data ?? []).map((r) => r.category_id as string));
      const rows = categoryIds
        .filter((c) => !existing.has(c))
        .map((category_id) => ({
          household_id: householdId!,
          category_id,
          month: nextMonth,
          actual_amount: 0,
        }));
      if (rows.length) {
        const { error: e } = await supabase.from("spending_actuals").insert(rows);
        if (e) throw e;
      }
      return nextMonth;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spending_actuals"] }),
  });
}

/** Create a spending category (plain-text parent_category grouping). */
export function useCreateCategory() {
  const qc = useQueryClient();
  const { householdId } = useAuth();
  return useMutation({
    mutationFn: async ({
      name,
      parentCategory,
      domain = "spending",
      icon,
      color,
    }: {
      name: string;
      parentCategory?: string | null;
      domain?: string;
      icon?: string | null;
      color?: string | null;
    }): Promise<Category> => {
      const { data, error } = await supabase
        .from("categories")
        .insert({
          household_id: householdId!,
          name,
          parent_category: parentCategory || null,
          domain,
          icon: icon || null,
          color: color || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Category;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

/** Update an existing category (name, grouping, ADR-029 icon/colour). */
export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      parent_category?: string | null;
      icon?: string | null;
      color?: string | null;
    }) => {
      const { error } = await supabase.from("categories").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

/* ---------------- Debt strategy ---------------- */

export function useDebtStrategySettings() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["debt_strategy_settings", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<DebtStrategySettings | null> => {
      const { data, error } = await supabase
        .from("debt_strategy_settings")
        .select("*")
        .eq("household_id", householdId!)
        .maybeSingle();
      if (error) throw error;
      return (data as DebtStrategySettings | null) ?? null;
    },
  });
}

export function useSaveDebtStrategySettings() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      active_strategy?: string;
      extra_monthly_payment?: number;
    }) => {
      const { error } = await supabase
        .from("debt_strategy_settings")
        .upsert(
          {
            household_id: householdId!,
            ...patch,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "household_id" },
        );
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["debt_strategy_settings"] }),
  });
}

/* ---------------- Payment schedule check-offs ---------------- */

/**
 * Month check-offs are shared household state when the optional
 * `payment_schedule_checkoffs` table exists; otherwise we fall back to
 * device-local storage so the screen still works.
 */
const CHECKOFF_TABLE = "payment_schedule_checkoffs";

function localKey(householdId: string) {
  return `hearthstone:schedule-checkoffs:${householdId}`;
}

function readLocal(householdId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(localKey(householdId)) ?? "[]");
  } catch {
    return [];
  }
}

function writeLocal(householdId: string, months: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localKey(householdId), JSON.stringify(months));
}

export function useScheduleCheckoffs() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["schedule_checkoffs", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from(CHECKOFF_TABLE)
        .select("month")
        .eq("household_id", householdId!);
      if (error) return readLocal(householdId!);
      return ((data ?? []) as { month: string }[]).map((r) => r.month);
    },
  });
}

export function useToggleScheduleCheckoff() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ month, done }: { month: string; done: boolean }) => {
      const hh = householdId!;
      if (done) {
        const { error } = await supabase
          .from(CHECKOFF_TABLE)
          .upsert({ household_id: hh, month }, { onConflict: "household_id,month" });
        if (error) writeLocal(hh, [...new Set([...readLocal(hh), month])]);
      } else {
        const { error } = await supabase
          .from(CHECKOFF_TABLE)
          .delete()
          .eq("household_id", hh)
          .eq("month", month);
        if (error) writeLocal(hh, readLocal(hh).filter((m) => m !== month));
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule_checkoffs"] }),
  });
}

/** Every balance snapshot for the household's accounts, newest first. */
export function useAllAccountBalances() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["all_account_balances", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<AccountBalance[]> => {
      const { data: accts } = await supabase
        .from("accounts")
        .select("id")
        .eq("household_id", householdId!);
      const ids = (accts ?? []).map((a) => a.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("account_balances")
        .select("*")
        .in("account_id", ids)
        .order("as_of_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AccountBalance[];
    },
  });
}

/** ADR-027: savings goals (sinking funds). Additive, household-scoped. */
export function useSavingsGoals() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["savings_goals", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<SavingsGoal[]> => {
      const { data, error } = await supabase
        .from("savings_goals")
        .select("*")
        .eq("household_id", householdId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SavingsGoal[];
    },
  });
}

export function useUpsertSavingsGoal() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (g: Partial<SavingsGoal> & { name: string; target_amount: number }) => {
      const payload = { ...g, household_id: householdId };
      if (g.id) {
        const { error } = await supabase.from("savings_goals").update(payload).eq("id", g.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("savings_goals").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings_goals"] }),
  });
}

export function useDeleteSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("savings_goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings_goals"] }),
  });
}

/** ADR-028: the household row (name + export_format). */
export function useHousehold() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["household", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Household | null> => {
      const { data, error } = await supabase
        .from("households")
        .select("*")
        .eq("id", householdId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Household | null;
    },
  });
}

export function useSetExportFormat() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (format: ExportFormat) => {
      const { error } = await supabase
        .from("households")
        .update({ export_format: format })
        .eq("id", householdId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["household"] }),
  });
}
