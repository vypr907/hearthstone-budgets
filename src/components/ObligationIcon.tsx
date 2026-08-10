import { useMemo } from "react";
import type { Institution } from "@/lib/supabase";
import { InstitutionLogo } from "@/components/InstitutionLogo";
import { EmojiIcon } from "@/components/viz";

/**
 * Avatar for a bill / debt / account row.
 *
 * Prefers the linked institution's logo (ADR-030); falls back to the
 * institution's type icon, and finally to the name-derived emoji.
 */
export function ObligationIcon({
  institution,
  name,
  fallback,
  size = 40,
  className,
}: {
  institution?: Institution | null;
  name?: string | null;
  fallback?: string;
  size?: number;
  className?: string;
}) {
  if (institution?.logo_url?.trim() || institution?.institution_type?.trim()) {
    return (
      <InstitutionLogo
        logoUrl={institution.logo_url}
        type={institution.institution_type}
        size={size}
        className={className}
      />
    );
  }
  return <EmojiIcon name={name} fallback={fallback} className={className} />;
}

/** id → institution lookup, memoized for list rendering. */
export function useInstitutionIndex(institutions: Institution[]) {
  return useMemo(() => {
    const m: Record<string, Institution> = {};
    for (const i of institutions) m[i.id] = i;
    return m;
  }, [institutions]);
}
