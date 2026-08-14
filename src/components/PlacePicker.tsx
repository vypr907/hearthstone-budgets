import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInstitutions, useUpsertInstitution } from "@/lib/data-hooks";
import { guessMerchantDomain, suggestedLogoUrl } from "@/lib/visual-meta";

/**
 * ADR-063 (amends ADR-053): the institution search / inline-create picker,
 * extracted out of the Add Transaction description field so Place and
 * Description are independent. Storage and matching behavior are unchanged —
 * the value is a `transactions.institution_id`.
 */
export function PlacePicker({
  value,
  onChange,
  label = "Place (optional)",
  compact = false,
}: {
  value: string | null;
  onChange: (institutionId: string | null) => void;
  label?: string;
  compact?: boolean;
}) {
  const { data: institutions = [] } = useInstitutions();
  const saveInstitution = useUpsertInstitution();
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => institutions.find((i) => i.id === value) ?? null,
    [institutions, value],
  );

  /** Places whose name matches what's being typed, best few first. */
  const matches = useMemo(() => {
    const d = search.trim().toLowerCase();
    if (d.length < 2 || value) return [];
    return institutions.filter((i) => i.name.toLowerCase().includes(d)).slice(0, 4);
  }, [search, institutions, value]);

  /** Trimmed search text that doesn't match any known institution yet. */
  const newPlace = useMemo(() => {
    const d = search.trim();
    if (d.length < 3 || value) return null;
    const known = institutions.some((i) => i.name.trim().toLowerCase() === d.toLowerCase());
    return known ? null : d;
  }, [search, institutions, value]);

  async function addPlace() {
    if (!newPlace) return;
    const domain = guessMerchantDomain(newPlace);
    try {
      const id = await saveInstitution.mutateAsync({
        name: newPlace,
        institution_type: "other",
        logo_url: domain ? suggestedLogoUrl(domain) : null,
      });
      if (typeof id === "string") onChange(id);
      setSearch("");
      toast.success(`Added ${newPlace}`);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : ((e as { message?: string })?.message ?? "Could not add place");
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-2">
      {compact ? null : <Label htmlFor="place-search">{label}</Label>}
      {selected ? (
        <div className="flex items-center gap-2 rounded-[12px] bg-muted/50 p-2 text-xs">
          {selected.logo_url ? (
            <img src={selected.logo_url} alt="" className="h-5 w-5 rounded-full object-contain" />
          ) : (
            <span aria-hidden className="text-base">
              🏪
            </span>
          )}
          <span className="min-w-0 flex-1 truncate">
            Tracked at <span className="font-semibold">{selected.name}</span>
          </span>
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => {
              onChange(null);
              setSearch("");
            }}
          >
            Clear
          </button>
        </div>
      ) : (
        <>
          <Input
            id="place-search"
            className={compact ? "h-10" : "h-12"}
            placeholder="Search or add a place"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {matches.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {matches.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className="flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1.5 text-xs active:bg-muted"
                  onClick={() => {
                    onChange(i.id);
                    setSearch("");
                  }}
                >
                  {i.logo_url ? (
                    <img src={i.logo_url} alt="" className="h-4 w-4 rounded-full object-contain" />
                  ) : (
                    <span aria-hidden>🏪</span>
                  )}
                  {i.name}
                </button>
              ))}
            </div>
          ) : null}
          {newPlace ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[12px] bg-muted/50 p-2 text-left text-xs active:bg-muted"
              disabled={saveInstitution.isPending}
              onClick={() => void addPlace()}
            >
              <span aria-hidden className="text-base">
                🏪
              </span>
              <span className="min-w-0 flex-1">
                New place? Save <span className="font-semibold">{newPlace}</span> as an institution
              </span>
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
