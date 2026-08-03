import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  supabase,
  type IncomeSource,
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
      const { error } = await supabase
        .from("income_events")
        .upsert({ ...row, household_id: householdId! });
      if (error) throw error;
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

/** Set (or clear) one category's allocation for one paycheck. */
export function useSetAllocation() {
  const { householdId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id?: string;
      incomeEventId: string;
      categoryId: string;
      amount: number;
    }) => {
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
        category_id: args.categoryId,
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
