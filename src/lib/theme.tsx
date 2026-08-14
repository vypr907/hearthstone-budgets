import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type ThemeName } from "./supabase";
import { useAuth } from "./auth-context";

/** ADR-061: swatch metadata for the Settings screen's theme picker. */
export const THEME_OPTIONS: {
  value: ThemeName;
  label: string;
  background: string;
  brand: string;
  text: string;
}[] = [
  { value: "standard", label: "Standard", background: "#f7f8fa", brand: "#4a9d5c", text: "#1f2430" },
  { value: "halo", label: "Halo", background: "#0b0e14", brand: "#00f0ff", text: "#e8f4ff" },
  { value: "hellokitty", label: "Hello Kitty", background: "#ffe5ec", brand: "#e60012", text: "#4a2a33" },
  { value: "purple_dark", label: "Purple — Dark", background: "#120e16", brand: "#9d4edd", text: "#e8dff5" },
  { value: "purple_pastel", label: "Purple — Pastel", background: "#f3eff5", brand: "#d8b4f8", text: "#232124" },
  { value: "cyber_neon", label: "Cyber — Neon", background: "#08090c", brand: "#00f5ff", text: "#e2e8f0" },
  { value: "cyber_stealth", label: "Cyber — Stealth", background: "#121212", brand: "#00ff66", text: "#f8fafc" },
];

const ThemeContext = createContext<ThemeName>("standard");

function useMemberTheme() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["member_theme", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ThemeName> => {
      const { data, error } = await supabase
        .from("household_members")
        .select("theme")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.theme as ThemeName | undefined) ?? "standard";
    },
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: theme } = useMemberTheme();

  useEffect(() => {
    document.documentElement.dataset.theme = theme ?? "standard";
  }, [theme]);

  return <ThemeContext.Provider value={theme ?? "standard"}>{children}</ThemeContext.Provider>;
}

/** Current member's theme (already applied to the document). */
export function useTheme() {
  return useContext(ThemeContext);
}

/** ADR-061: writes household_members.theme for the current user (same shape as useSetExportFormat). */
export function useSetTheme() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (theme: ThemeName) => {
      // Selecting the affected rows makes a blocked write visible: PostgREST
      // returns success with zero rows when RLS hides the row from UPDATE, so
      // without this the picker showed a false "saved" toast and nothing changed.
      const { data, error } = await supabase
        .from("household_members")
        .update({ theme })
        .eq("user_id", user!.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Theme could not be saved — your member row is not updatable.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member_theme"] }),
  });
}

