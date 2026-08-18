import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  supabase,
  type IncomeSource,
  type IncomeSourceDeduction,
  type IncomeSourceSplit,
  type IncomeEvent,
  type PayPeriodAllocation,
} from "./supabase";
import { useAuth } from "./auth-context";

export function useIncomeSources() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["income_sources", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<IncomeSource[]> => {
      const { data, error } = await supabase
        .from("income_sources")
        .select("*")
        .eq("household_id", householdId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as IncomeSource[];
    },
  });
}

export function useIncomeEvents() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["income_events", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<IncomeEvent[]> => {
      const { data, error } = await supabase
        .from("income_events")
        .select("*")
        .eq("household_id", householdId!)
        .order("expected_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as IncomeEvent[];
    },
  });
}

export function useIncomeSourceSplits(sourceId?: string | null) {
  return useQuery({
    queryKey: ["income_source_splits", sourceId],
    enabled: !!sourceId,
    queryFn: async (): Promise<IncomeSourceSplit[]> => {
      const { data, error } = await supabase
        .from("income_source_splits")
        .select("*")
        .eq("income_source_id", sourceId!)
        .order("sort_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as IncomeSourceSplit[];
    },
  });
}

export function usePayPeriodAllocations() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["pay_period_allocations", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<PayPeriodAllocation[]> => {
      const { data, error } = await supabase
        .from("pay_period_allocations")
        .select("*")
        .eq("household_id", householdId!);
      if (error) throw error;
      return (data ?? []) as PayPeriodAllocation[];
    },
  });
}

export function useUpsertIncomeSource() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<IncomeSource> & { id?: string }) => {
      const payload = { ...row, household_id: householdId! };
      // Only one primary source may exist per household.
      if (payload.is_primary) {
        await supabase
          .from("income_sources")
          .update({ is_primary: false })
          .eq("household_id", householdId!);
      }
      const { error } = await supabase.from("income_sources").upsert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income_sources", householdId] });
    },
  });
}

export function useDeleteIncomeSource() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("income_sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income_sources", householdId] });
    },
  });
}

export function useUpsertIncomeEvent() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<IncomeEvent> & { id?: string }) => {
      const { data, error } = await supabase
        .from("income_events")
        .upsert({ ...row, household_id: householdId! })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income_events", householdId] });
    },
  });
}

export function useDeleteIncomeEvent() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("income_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income_events", householdId] });
    },
  });
}

/**
 * ADR-047: marking a paycheck received also writes the deposit ledger rows
 * defined by its source's splits — 'fixed' rows take their amount, a
 * 'remainder' row takes whatever is left of the received amount. The rows share
 * `split_group_id = income_event.id`, which both groups them in the ledger UI
 * and makes the write idempotent.
 */
export function useMarkIncomeReceived() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      event: IncomeEvent;
      actualAmount?: number;
      actualDate?: string;
      sourceName?: string;
      /** ADR-047 follow-up: account to deposit into when the source has no
       *  usable split rows. Ignored when splits resolve to deposit rows. */
      accountId?: string;
    }) => {
      const { event } = args;
      const amount = Number(args.actualAmount ?? event.actual_amount ?? event.expected_amount ?? 0);
      const date = args.actualDate ?? event.actual_date ?? event.expected_date ?? null;
      if (!amount) throw new Error("Enter the amount received");
      if (!date) throw new Error("This paycheck has no date");

      const { error: evtError } = await supabase
        .from("income_events")
        .update({
          status: "received",
          actual_amount: amount,
          actual_date: date,
        })
        .eq("id", event.id);
      if (evtError) throw evtError;

      // Already deposited? Never double-write the ledger.
      const { data: existing, error: exError } = await supabase
        .from("transactions")
        .select("id")
        .eq("split_group_id", event.id)
        .limit(1);
      if (exError) throw exError;
      if (existing && existing.length > 0) return { deposits: 0 };

      const label = `Paycheck: ${args.sourceName ?? "Income"}`;
      // ADR-047: a split may land a day or two after the pay date.
      const shift = (days: number | null | undefined) => {
        if (!days) return date;
        const d = new Date(`${date}T00:00:00`);
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
      };

      const rows: Array<{
        household_id: string;
        account_id: string;
        amount: number;
        status: "cleared";
        description: string;
        transaction_date: string;
        split_group_id: string;
      }> = [];

      if (event.income_source_id) {
        const { data: splitRows, error: splitError } = await supabase
          .from("income_source_splits")
          .select("*")
          .eq("income_source_id", event.income_source_id)
          .order("sort_order", { ascending: true, nullsFirst: false });
        if (splitError) throw splitError;
        const splits = (splitRows ?? []) as IncomeSourceSplit[];

        const fixed = splits.filter((s) => (s.split_type ?? "fixed").toLowerCase() !== "remainder");
        const fixedTotal = fixed.reduce((sum, s) => sum + Number(s.amount ?? 0), 0);
        const remainder = splits.find((s) => (s.split_type ?? "").toLowerCase() === "remainder");

        for (const s of fixed) {
          if (s.account_id && Number(s.amount ?? 0) > 0) {
            rows.push({
              household_id: householdId!,
              account_id: s.account_id,
              amount: Number(s.amount ?? 0),
              status: "cleared",
              description: label,
              transaction_date: shift(s.day_offset),
              split_group_id: event.id,
            });
          }
        }
        if (remainder?.account_id) {
          const left = Math.round((amount - fixedTotal) * 100) / 100;
          if (left > 0) {
            rows.push({
              household_id: householdId!,
              account_id: remainder.account_id,
              amount: left,
              status: "cleared",
              description: label,
              transaction_date: shift(remainder.day_offset),
              split_group_id: event.id,
            });
          }
        }
      }

      // ADR-047 follow-up: when the source has no usable split rows, fall back
      // to a single deposit into the caller-chosen account. If none was given,
      // surface a clear error instead of silently marking the event received
      // with no ledger entry.
      if (rows.length === 0) {
        if (!args.accountId) {
          throw new Error(
            "This income source has no deposit splits. Pick an account to deposit this paycheck into.",
          );
        }
        rows.push({
          household_id: householdId!,
          account_id: args.accountId,
          amount,
          status: "cleared",
          description: label,
          transaction_date: date,
          split_group_id: event.id,
        });
      }

      // ADR-055: append one deposit row per deduction that has a destination
      // account. Percent deductions compute against the event's net amount.
      // Deductions with no destination_account_id are reporting-only — skip.
      // ADR-068: remember which row belongs to which deduction so a funded
      // bill/debt can be linked to that exact deposit after the insert.
      const postedDeductions: Array<{
        deduction: IncomeSourceDeduction;
        amount: number;
        rowIndex: number;
      }> = [];
      if (event.income_source_id) {
        const { data: deductionRows, error: dedError } = await supabase
          .from("income_source_deductions")
          .select("*")
          .eq("income_source_id", event.income_source_id);
        if (dedError) throw dedError;
        const deductions = (deductionRows ?? []) as IncomeSourceDeduction[];
        for (const d of deductions) {
          if (!d.destination_account_id) continue;
          const dedAmount =
            d.amount != null
              ? Number(d.amount)
              : Math.round(((Number(d.percent ?? 0) / 100) * amount) * 100) / 100;
          if (dedAmount <= 0) continue;
          rows.push({
            household_id: householdId!,
            account_id: d.destination_account_id,
            amount: dedAmount,
            status: "cleared",
            description: `Deduction: ${d.name}`,
            transaction_date: date,
            split_group_id: event.id,
          });
        }
      }

      const { error } = await supabase.from("transactions").insert(rows);
      if (error) throw error;
      return { deposits: rows.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income_events", householdId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["latest_balances"] });
    },
  });
}

/**
 * Set (or clear) one allocation for one paycheck. ADR-039/ADR-059: a row targets
 * exactly one of category, savings goal, bill, or debt (DB check constraint).
 */
export function useSetAllocation() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id?: string;
      incomeEventId: string;
      categoryId?: string | null;
      goalId?: string | null;
      billId?: string | null;
      debtId?: string | null;
      amount: number;
    }) => {
      const targets = [args.categoryId, args.goalId, args.billId, args.debtId].filter(Boolean);
      if (targets.length > 1) {
        throw new Error(
          "An allocation can target a category, savings goal, bill, or debt — only one.",
        );
      }
      if (targets.length === 0) {
        throw new Error("An allocation needs a category, savings goal, bill, or debt.");
      }
      if (!args.amount) {
        if (args.id) {
          const { error } = await supabase
            .from("pay_period_allocations")
            .delete()
            .eq("id", args.id);
          if (error) throw error;
        }
        return;
      }
      const payload = {
        ...(args.id ? { id: args.id } : {}),
        household_id: householdId!,
        income_event_id: args.incomeEventId,
        category_id: args.categoryId ?? null,
        goal_id: args.goalId ?? null,
        bill_id: args.billId ?? null,
        debt_id: args.debtId ?? null,
        allocated_amount: args.amount,
      };
      const { error } = await supabase.from("pay_period_allocations").upsert(payload);
      if (error) throw error;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pay_period_allocations", householdId] });
    },
  });
}

/** ADR-054: deposit splits are editable from the income source detail view. */
export function useUpsertIncomeSourceSplit(sourceId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<IncomeSourceSplit> & { income_source_id: string }) => {
      const { error } = await supabase.from("income_source_splits").upsert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income_source_splits", sourceId] });
    },
  });
}

export function useDeleteIncomeSourceSplit(sourceId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("income_source_splits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income_source_splits", sourceId] });
    },
  });
}

/* -------- ADR-055: Income source deductions -------- */

export function useIncomeSourceDeductions(sourceId?: string | null) {
  return useQuery({
    queryKey: ["income_source_deductions", sourceId],
    enabled: !!sourceId,
    queryFn: async (): Promise<IncomeSourceDeduction[]> => {
      const { data, error } = await supabase
        .from("income_source_deductions")
        .select("*")
        .eq("income_source_id", sourceId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as IncomeSourceDeduction[];
    },
  });
}

export function useUpsertIncomeSourceDeduction(sourceId?: string | null) {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      row: Partial<IncomeSourceDeduction> & { income_source_id: string; name: string },
    ) => {
      const payload = { ...row, household_id: householdId! };
      const { error } = await supabase.from("income_source_deductions").upsert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income_source_deductions", sourceId] });
    },
  });
}

export function useDeleteIncomeSourceDeduction(sourceId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("income_source_deductions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income_source_deductions", sourceId] });
    },
  });
}
