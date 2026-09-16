import { useMemo } from "react";
import type { Institution } from "@/lib/supabase";
import { InstitutionLogo } from "@/components/InstitutionLogo";
import { EmojiIcon, emojiFor } from "@/components/viz";
import { institutionTypeVisual } from "@/lib/visual-meta";
import { cn } from "@/lib/utils";

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

/**
 * Faint oversized institution mark meant to sit behind a card's content as a
 * background watermark (the treatment used on the Everything page) rather
 * than a normal-sized avatar. Spans the full height of its container, just
 * right of center. Caller is responsible for giving its container
 * `relative` + `overflow-hidden` so this crops to the card instead of
 * bleeding into neighbors, and marking every sibling `relative` so it
 * paints above the watermark.
 */
export function ObligationWatermark({
  institution,
  name,
  fallback,
  className,
}: {
  institution?: Institution | null;
  name?: string | null;
  fallback?: string;
  className?: string;
}) {
  if (institution?.logo_url?.trim()) {
    return (
      <img
        src={institution.logo_url}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn(
          "pointer-events-none absolute left-[58%] top-0 h-full w-36 -translate-x-1/2 select-none object-contain object-top opacity-[0.10]",
          className,
        )}
      />
    );
  }
  const glyph = institution?.institution_type?.trim()
    ? institutionTypeVisual(institution.institution_type).icon
    : emojiFor(name, fallback ?? "🏦");
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-[58%] top-0 -translate-x-1/2 select-none text-8xl leading-none opacity-[0.12]",
        className,
      )}
    >
      {glyph}
    </span>
  );
}

/** id → institution lookup, memoized for list rendering. */
export function useInstitutionIndex(institutions: Institution[]) {
  return useMemo(() => {
    const m: Record<string, Institution> = {};
    for (const i of institutions) m[i.id] = i;
    return m;
  }, [institutions]);
}
