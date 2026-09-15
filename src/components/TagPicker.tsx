import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Plus, Tag as TagIcon } from "lucide-react";
import { useTags } from "@/lib/tags";
import { tagVisual } from "@/lib/visual-meta";
import { TagDialog } from "@/components/TagDialog";

/**
 * ADR-104: multi-select tag chip picker. Same Popover + Checkbox interaction
 * as the institution↔category picker (InstitutionDialog.tsx) and the
 * Transactions filter panel's multi-category filter — this is the third use
 * of that pattern, not a new one.
 */
export function TagPicker({
  tagIds,
  onChange,
  compact,
}: {
  tagIds: string[];
  onChange: (ids: string[]) => void;
  /** Smaller trigger for inline use inside a split row. */
  compact?: boolean;
}) {
  const { data: tags = [] } = useTags();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  const toggle = (id: string) =>
    onChange(tagIds.includes(id) ? tagIds.filter((x) => x !== id) : [...tagIds, id]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={
              compact ? "h-9 shrink-0 justify-between gap-1 px-2" : "h-11 w-full justify-between"
            }
          >
            {compact ? (
              <>
                <TagIcon className="h-4 w-4 shrink-0 opacity-70" />
                {tagIds.length > 0 ? (
                  <span className="text-xs tabular-nums">{tagIds.length}</span>
                ) : null}
              </>
            ) : (
              <span className="truncate">
                {tagIds.length === 0
                  ? "No tags"
                  : tags
                      .filter((t) => tagIds.includes(t.id))
                      .map((t) => `${tagVisual(t).icon} ${t.name}`)
                      .join(", ")}
              </span>
            )}
            <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="max-h-72 w-64 overflow-y-auto p-2" align="start">
          {tags.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No tags yet.</p>
          ) : (
            tags.map((t) => {
              const on = tagIds.includes(t.id);
              const visual = tagVisual(t);
              return (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-muted"
                >
                  <Checkbox checked={on} onCheckedChange={() => toggle(t.id)} />
                  <span aria-hidden>{visual.icon}</span>
                  <span className="truncate">{t.name}</span>
                </label>
              );
            })
          )}
          <Button
            type="button"
            variant="ghost"
            className="mt-1 h-9 w-full justify-start gap-2 text-sm"
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" /> New tag
          </Button>
        </PopoverContent>
      </Popover>
      {creating ? (
        <TagDialog
          tag={{}}
          onClose={() => setCreating(false)}
          onCreated={(t) => onChange([...tagIds, t.id])}
        />
      ) : null}
    </>
  );
}
