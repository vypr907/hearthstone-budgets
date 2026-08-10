import { useState } from "react";
import { toast } from "sonner";
import {
  useUpsertInstitution,
  useDeleteInstitution,
  useCategories,
  useInstitutionCategories,
  useSetInstitutionCategories,
  useAccounts,
} from "@/lib/data-hooks";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { AccountDialog } from "@/components/AccountDialog";

import type { Institution } from "@/lib/supabase";
import { InstitutionLogo } from "@/components/InstitutionLogo";
import { categoryVisual, formatTypeLabel, suggestedLogoUrl } from "@/lib/visual-meta";
import { formatMoney } from "@/lib/format";

/** Allowed institution_type values (no schema constraint — UI list only). */
export const INSTITUTION_TYPES = [
  "bank",
  "credit_card",
  "lendor_lessor",
  "financial",
  "tool",
  "medical",
  "utility",
  "subscription",
  "other",
];

/**
 * Shared institution add/edit form. Reused inline by the Bill and Debt forms,
 * which pass `onSaved` to auto-select the freshly created institution.
 */
export function InstitutionDialog({
  institution,
  onClose,
  onSaved,
}: {
  institution: Partial<Institution> | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const upsert = useUpsertInstitution();
  const del = useDeleteInstitution();
  const { data: categories = [] } = useCategories();
  const { data: instCats = {} } = useInstitutionCategories();
  const { data: accounts = [] } = useAccounts();
  const setCats = useSetInstitutionCategories();
  const [catIds, setCatIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [username, setUsername] = useState("");
  const [google, setGoogle] = useState(false);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);

  const open = institution !== null;
  const isEdit = !!institution?.id;
  const key = institution?.id ?? "new";
  const [lastKey, setLastKey] = useState("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(institution?.name ?? "");
    setType(institution?.institution_type ?? "");
    setLoginUrl(institution?.login_url ?? "");
    setUsername(institution?.login_username ?? "");
    setGoogle(!!institution?.sign_in_with_google);
    setDescription(institution?.description ?? "");
    setNotes(institution?.notes ?? "");
    setLogoUrl(institution?.logo_url ?? (suggestedLogoUrl(institution?.login_url) || ""));
    setCatIds(institution?.id ? (instCats[institution.id] ?? []) : []);
  }
  if (!open && lastKey !== "") setLastKey("");

  const linkedAccounts = institution?.id
    ? accounts.filter((a) => a.institution_id === institution.id)
    : [];

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const id = await upsert.mutateAsync({
        id: institution?.id,
        name: name.trim(),
        institution_type: type || null,
        login_url: loginUrl || null,
        login_username: username || null,
        sign_in_with_google: google,
        description: description || null,
        notes: notes || null,
        logo_url: logoUrl.trim() || null,
      });
      await setCats.mutateAsync({ institutionId: id, categoryIds: catIds });
      toast.success(isEdit ? "Institution updated" : "Institution added");
      onSaved?.(id);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!institution?.id) return;
    if (!confirm("Delete this institution?")) return;
    try {
      await del.mutateAsync(institution.id);
      toast.success("Institution deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit institution" : "Add institution"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </div>
          <div>
            <Label>Categories</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground">No categories yet.</p>
              )}
              {categories.map((c) => {
                const on = catIds.includes(c.id);
                const visual = categoryVisual(c);
                return (
                  <Button
                    key={c.id}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    className="h-9 gap-1"
                    onClick={() =>
                      setCatIds((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                    }
                  >
                    <span aria-hidden>{visual.icon}</span>
                    {c.name}
                  </Button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Optional — pick any number.</p>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type || "none"} onValueChange={(v) => setType(v === "none" ? "" : v)}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Pick a type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unset</SelectItem>
                {INSTITUTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {formatTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Login URL</Label>
            <Input
              type="url"
              value={loginUrl}
              onChange={(e) => {
                setLoginUrl(e.target.value);
                if (!logoUrl.trim()) {
                  const s = suggestedLogoUrl(e.target.value);
                  if (s) setLogoUrl(s);
                }
              }}
              onBlur={(e) => {
                if (!logoUrl.trim()) {
                  const s = suggestedLogoUrl(e.target.value);
                  if (s) setLogoUrl(s);
                }
              }}
              className="h-11"
            />
          </div>
          <div>
            <Label>Logo URL</Label>
            <div className="flex items-center gap-2">
              <InstitutionLogo logoUrl={logoUrl} type={type} />
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
                className="h-11"
              />
              {suggestedLogoUrl(loginUrl) ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0"
                  onClick={() => setLogoUrl(suggestedLogoUrl(loginUrl)!)}
                >
                  Suggest
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Suggested from the login URL's domain — edit or clear before saving.
            </p>
          </div>
          <div>
            <Label>Login username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="flex items-center justify-between rounded border border-border p-3">
            <Label htmlFor="i-google">Sign in with Google</Label>
            <Switch id="i-google" checked={google} onCheckedChange={setGoogle} />
          </div>
          <div>
            <Label>Linked accounts</Label>
            {!institution?.id ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Save this institution first, then add its accounts here.
              </p>
            ) : linkedAccounts.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">No accounts linked yet.</p>
            ) : (
              <div className="mt-1 divide-y divide-border/50 rounded-md border">
                {linkedAccounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-2 py-2 text-sm">
                    <span className="truncate">{a.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(Number(a.starting_balance ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {institution?.id ? (
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-10 w-full"
                onClick={() => setAddingAccount(true)}
              >
                <Plus className="mr-2 h-4 w-4" /> Add account
              </Button>
            ) : null}
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Passwords are never stored in Hearthstone.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit ? (
            <Button variant="destructive" className="h-11" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={upsert.isPending} className="h-11">
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
        <AccountDialog
          account={addingAccount ? { institution_id: institution?.id } : null}
          onClose={() => setAddingAccount(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
