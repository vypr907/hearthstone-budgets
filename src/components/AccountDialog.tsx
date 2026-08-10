import { useState } from "react";
import { toast } from "sonner";
import { useUpsertAccount, useDeleteAccount, useInstitutions } from "@/lib/data-hooks";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import type { Account } from "@/lib/supabase";

/**
 * Shared account add/edit form. Reused by the Accounts screen and by the
 * Institution form's inline "+ Add account" action, which pre-fills
 * institution_id.
 */
export function AccountDialog({
  account,
  onClose,
  onSaved,
}: {
  account: Partial<Account> | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const upsert = useUpsertAccount();
  const del = useDeleteAccount();
  const { data: institutions = [] } = useInstitutions();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [starting, setStarting] = useState("");
  const [notes, setNotes] = useState("");
  const [isSpendable, setIsSpendable] = useState(false);
  const [creditLimit, setCreditLimit] = useState("");
  const [institutionId, setInstitutionId] = useState("none");

  const open = account !== null;
  const isEdit = !!account?.id;
  const key = account?.id ?? `new:${account?.institution_id ?? ""}`;
  const [lastKey, setLastKey] = useState("");
  const isCredit = type.trim().toLowerCase() === "credit";
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(account?.name ?? "");
    setType(account?.account_type ?? "");
    setStarting(account?.starting_balance != null ? String(account.starting_balance) : "");
    setNotes(account?.notes ?? "");
    setIsSpendable(account?.is_spendable ?? false);
    setCreditLimit(account?.credit_limit != null ? String(account.credit_limit) : "");
    setInstitutionId(account?.institution_id ?? "none");
  }
  if (!open && lastKey !== "") setLastKey("");

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const id = await upsert.mutateAsync({
        id: account?.id,
        name: name.trim(),
        account_type: type.trim() ? type.trim().toLowerCase() : null,
        starting_balance: starting ? Number(starting) : null,
        notes: notes || null,
        is_spendable: isSpendable,
        credit_limit: isCredit && creditLimit ? Number(creditLimit) : null,
        institution_id: institutionId === "none" ? null : institutionId,
      });
      toast.success(isEdit ? "Account updated" : "Account added");
      if (id) onSaved?.(id);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!account?.id) return;
    if (!confirm("Delete this account?")) return;
    try {
      await del.mutateAsync(account.id);
      toast.success("Account deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit account" : "Add account"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </div>
          <div>
            <Label>Institution</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Type</Label>
            <Input
              placeholder="Checking, savings, credit…"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-11"
            />
          </div>
          <div>
            <Label>Starting balance</Label>
            <Input
              type="number"
              step="0.01"
              value={starting}
              onChange={(e) => setStarting(e.target.value)}
              className="h-11"
            />
          </div>
          {isCredit && (
            <div>
              <Label>Credit limit</Label>
              <Input
                type="number"
                step="0.01"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="h-11"
              />
            </div>
          )}
          <div className="flex items-center gap-2 py-1">
            <Checkbox
              id="isSpendable"
              checked={isSpendable}
              onCheckedChange={(v) => setIsSpendable(v === true)}
            />
            <Label htmlFor="isSpendable" className="font-normal">
              Spendable
            </Label>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit ? (
            <Button variant="destructive" onClick={handleDelete} className="h-11">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={upsert.isPending} className="h-11">
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
