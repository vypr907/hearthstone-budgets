import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Plus } from "lucide-react";
import { useCategories, useCreateCategory, useUpdateCategory } from "@/lib/data-hooks";
import type { Category } from "@/lib/supabase";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  categoryVisual,
} from "@/lib/visual-meta";

export const Route = createFileRoute("/app/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Hearthstone" },
      {
        name: "description",
        content:
          "Name, group, and style the spending categories your household budget and ledger use.",
      },
      { property: "og:title", content: "Categories — Hearthstone" },
      {
        property: "og:description",
        content:
          "Name, group, and style the spending categories your household budget and ledger use.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategories();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);

  const groups = new Map<string, Category[]>();
  for (const c of categories) {
    const key = c.parent_category?.trim() || "Ungrouped";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  return (
    <>
      <AppHeader title="Categories" />
      <div className="space-y-3 p-4">
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add category
        </Button>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && categories.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No categories yet.
            </CardContent>
          </Card>
        )}

        {[...groups.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([parent, rows]) => (
            <Card key={parent}>
              <CardContent className="p-2">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {parent}
                </p>
                {rows
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => {
                    const v = categoryVisual(c);
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 border-l-4 px-2 py-2"
                        style={{ borderColor: v.color }}
                      >
                        <span
                          aria-hidden
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-lg"
                          style={{ background: `${v.color}22` }}
                        >
                          {v.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {c.name}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${c.name}`}
                          onClick={() => setEditing(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          ))}
      </div>

      <CategoryDialog category={editing} onClose={() => setEditing(null)} />
    </>
  );
}

export function CategoryDialog({
  category,
  onClose,
}: {
  category: Partial<Category> | null;
  onClose: () => void;
}) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const open = category !== null;
  const isEdit = !!category?.id;

  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);

  const key = category?.id ?? (open ? "new" : "");
  const [lastKey, setLastKey] = useState("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(category?.name ?? "");
    setParent(category?.parent_category ?? "");
    setIcon(category?.icon ?? null);
    setColor(category?.color ?? null);
  }
  if (!open && lastKey !== "") setLastKey("");

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: category!.id!,
          name: name.trim(),
          parent_category: parent.trim() || null,
          icon,
          color,
        });
      } else {
        await create.mutateAsync({
          name: name.trim(),
          parentCategory: parent.trim() || null,
          icon,
          color,
        });
      }
      toast.success(isEdit ? "Category updated" : "Category added");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit category" : "Add category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input className="h-12" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Parent category</Label>
            <Input
              className="h-12"
              placeholder="Optional grouping"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            />
          </div>
          <IconPicker value={icon} onChange={setIcon} />
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <DialogFooter>
          <Button
            className="h-12 w-full"
            disabled={create.isPending || update.isPending}
            onClick={save}
          >
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <Label>Icon</Label>
      <div className="mt-1 flex flex-wrap gap-1">
        {CATEGORY_ICONS.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={`Icon ${e}`}
            aria-pressed={value === e}
            onClick={() => onChange(value === e ? null : e)}
            className={`grid h-11 w-11 place-items-center rounded-[12px] text-xl ${
              value === e ? "bg-primary/15 ring-2 ring-primary" : "bg-muted"
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Optional — a generic tag icon is used when none is picked.
      </p>
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <Label>Color</Label>
      <div className="mt-1 flex flex-wrap gap-2">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            aria-pressed={value === c}
            onClick={() => onChange(value === c ? null : c)}
            className={`h-11 w-11 rounded-full border-2 ${
              value === c ? "border-foreground" : "border-transparent"
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Optional — gray is used when none is picked.
      </p>
    </div>
  );
}
