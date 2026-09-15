import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { useCreateTag, useUpdateTag, useDeleteTag } from "@/lib/tags";
import { IconPicker, ColorPicker } from "@/routes/app.categories";
import type { Tag } from "@/lib/supabase";

/** ADR-104: create/edit a tag — same shape as CategoryDialog, no parent grouping. */
export function TagDialog({
  tag,
  onClose,
  onCreated,
}: {
  tag: Partial<Tag> | null;
  onClose: () => void;
  /** Called with the new row right after a create (not an edit/delete) —
   *  lets a caller like TagPicker auto-select the tag it just made. */
  onCreated?: (tag: Tag) => void;
}) {
  const create = useCreateTag();
  const update = useUpdateTag();
  const del = useDeleteTag();
  const open = tag !== null;
  const isEdit = !!tag?.id;

  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);

  const key = tag?.id ?? (open ? "new" : "");
  const [lastKey, setLastKey] = useState("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(tag?.name ?? "");
    setIcon(tag?.icon ?? null);
    setColor(tag?.color ?? null);
  }
  if (!open && lastKey !== "") setLastKey("");

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ id: tag!.id!, name: name.trim(), icon, color });
      } else {
        const created = await create.mutateAsync({ name: name.trim(), icon, color });
        onCreated?.(created);
      }
      toast.success(isEdit ? "Tag updated" : "Tag added");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!tag?.id) return;
    if (!confirm(`Delete "${tag.name}"? It will be removed from every transaction it's on.`))
      return;
    try {
      await del.mutateAsync(tag.id);
      toast.success("Tag deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit tag" : "Add tag"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input className="h-12" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <IconPicker value={icon} onChange={setIcon} />
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit ? (
            <Button variant="destructive" className="h-11" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button
            className="h-11"
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
