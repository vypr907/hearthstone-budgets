import { useQuery } from "@tanstack/react-query";
import { supabase, type HouseholdMember } from "./supabase";
import { useAuth } from "./auth-context";

/**
 * ADR-088: the household's member rows (one per login). Used to populate the
 * "Belongs to" account-owner picker and to label owner chips.
 */
export function useHouseholdMembers() {
  const { householdId } = useAuth();
  return useQuery({
    queryKey: ["household_members", householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<HouseholdMember[]> => {
      const { data, error } = await supabase
        .from("household_members")
        .select("id, household_id, user_id, display_name, role, theme")
        .eq("household_id", householdId!)
        .order("role"); // owner before member, stable-ish
      if (error) throw error;
      return (data ?? []) as HouseholdMember[];
    },
  });
}

/**
 * ADR-088: the household_members row for the currently signed-in user — the
 * "viewer" whose personal accounts count toward the spendable / net-worth
 * numbers on screen. Same lookup pattern as useMemberTheme (src/lib/theme.tsx).
 * Returns undefined until it resolves; callers treat that as "show everything".
 */
export function useCurrentMember() {
  const { user } = useAuth();
  const { data: members } = useHouseholdMembers();
  return members?.find((m) => m.user_id === user?.id);
}

/** display_name, falling back to a readable label. */
export function memberLabel(m: Pick<HouseholdMember, "display_name"> | undefined | null) {
  return m?.display_name?.trim() || "Member";
}
