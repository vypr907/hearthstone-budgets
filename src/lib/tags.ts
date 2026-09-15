import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase";
import type { Tag, TransactionTag } from "./supabase";

/**
 * ADR-104: household tags. Mirrors useCategories()'s shape/conventions.
 */
export function useTags() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["tags", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("household_id", householdId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Tag[];
    },
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  const { householdId } = useAuth();
  return useMutation({
    mutationFn: async ({
      name,
      icon,
      color,
    }: {
      name: string;
      icon?: string | null;
      color?: string | null;
    }): Promise<Tag> => {
      const { data, error } = await supabase
        .from("tags")
        .insert({
          household_id: householdId!,
          name,
          icon: icon || null,
          color: color || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Tag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      icon?: string | null;
      color?: string | null;
    }) => {
      const { error } = await supabase.from("tags").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}

/** Deletes the tag; transaction_tags rows referencing it cascade-delete. */
export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["transaction_tags"] });
    },
  });
}

/**
 * ADR-104: every transaction_tags row for the household, keyed by
 * transaction id. Scoped by the household's own (small) tag id list rather
 * than a transaction id list — this table's row count tracks the household's
 * `tags` list, not its `transactions` list, so it never risks the
 * unpaginated-select-cap class of bug useTransactions() hit at 1000 rows.
 */
export function useTransactionTags() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["transaction_tags", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data: tags, error: tagsError } = await supabase
        .from("tags")
        .select("id")
        .eq("household_id", householdId!);
      if (tagsError) throw tagsError;
      const tagIds = (tags ?? []).map((t) => t.id as string);
      if (tagIds.length === 0) return {};
      const { data, error } = await supabase
        .from("transaction_tags")
        .select("transaction_id,tag_id")
        .in("tag_id", tagIds);
      if (error) throw error;
      const out: Record<string, string[]> = {};
      for (const r of (data ?? []) as TransactionTag[]) {
        (out[r.transaction_id] ??= []).push(r.tag_id);
      }
      return out;
    },
  });
}

/** Sync one transaction's tags: insert added rows, delete removed ones. */
export function useSetTransactionTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      transactionId,
      tagIds,
    }: {
      transactionId: string;
      tagIds: string[];
    }) => {
      const { data, error } = await supabase
        .from("transaction_tags")
        .select("tag_id")
        .eq("transaction_id", transactionId);
      if (error) throw error;
      const current = new Set((data ?? []).map((r) => r.tag_id as string));
      const next = new Set(tagIds);
      const toAdd = tagIds.filter((t) => !current.has(t));
      const toRemove = [...current].filter((t) => !next.has(t));
      if (toAdd.length) {
        const { error: e } = await supabase
          .from("transaction_tags")
          .insert(toAdd.map((tag_id) => ({ transaction_id: transactionId, tag_id })));
        if (e) throw e;
      }
      if (toRemove.length) {
        const { error: e } = await supabase
          .from("transaction_tags")
          .delete()
          .eq("transaction_id", transactionId)
          .in("tag_id", toRemove);
        if (e) throw e;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transaction_tags"] }),
  });
}
