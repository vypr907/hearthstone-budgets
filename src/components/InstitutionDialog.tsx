import { useState } from "react";
import { toast } from "sonner";
import {
  useUpsertInstitution,
  useDeleteInstitution,
  useCategories,
  useInstitutionCategories,
  useSetInstitutionCategories,
  useAccounts,
  useInstitutions,
  useInstitutionLinks,
  useUpsertInstitutionLink,
  useDeleteInstitutionLink,
  useInstitutionMemberAccounts,
  useUpsertInstitutionMemberAccount,
  useDeleteInstitutionMemberAccount,
} from "@/lib/data-hooks";
import { useHouseholdMembers, memberLabel } from "@/lib/household";
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

import type { Institution, InstitutionLink } from "@/lib/supabase";
import { InstitutionLogo } from "@/components/InstitutionLogo";
import { categoryVisual, formatTypeLabel, suggestedLogoUrl } from "@/lib/visual-meta";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";

import { formatMoney } from "@/lib/format";

/**
 * Allowed institution_type values. Also DB-enforced via a check constraint
 * (`institutions_institution_type_check`) — this list and the constraint
 * must be kept in sync; see the migration in
 * scripts/migrations/2026-09-09-institution-type-check-constraint.sql
 * (ADR-099 correction — this file previously and incorrectly claimed there
 * was no DB constraint).
 */
export const INSTITUTION_TYPES = [
  "bank",
  "credit_card",
  "lendor_lessor",
  "financial",
  "tool",
  "medical",
  "utility",
  "subscription",
  // ADR-099: restaurant/retail/leisure taxonomy, added to replace an
  // over-broad "other" bucket for merchant-type institutions.
  "restaurant",
  "grocery_store",
  "gas_station",
  "liquor_store",
  "department_store",
  "specialty_store",
  "venue",
  "game",
  "app",
  "dispensary",
  "personal_care",
  "employer",
  "delivery",
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
  const { data: allInstitutions = [] } = useInstitutions();
  const { data: allLinks = [] } = useInstitutionLinks();
  const upsertLink = useUpsertInstitutionLink();
  const deleteLink = useDeleteInstitutionLink();
  const { data: members = [] } = useHouseholdMembers();
  const { data: allMemberAccounts = [] } = useInstitutionMemberAccounts();
  const upsertMemberAccount = useUpsertInstitutionMemberAccount();
  const deleteMemberAccount = useDeleteInstitutionMemberAccount();
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
  const [parentId, setParentId] = useState("");
  // ADR-106: a link's kind/label/url being composed before "Add link" is pressed.
  const [newLinkKind, setNewLinkKind] = useState<InstitutionLink["kind"]>("bill_pay");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  // ADR-106: per-member account fields, keyed by member_id — saved alongside
  // the institution itself on the main Save button, same as categories.
  const [memberFields, setMemberFields] = useState<
    Record<string, { account_number: string; login_username: string; notes: string }>
  >({});

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
    setParentId(institution?.parent_institution_id ?? "");
    const existingLinks = institution?.id
      ? allLinks.filter((l) => l.institution_id === institution.id)
      : [];
    setNewLinkKind(existingLinks.some((l) => l.kind === "bill_pay") ? "other" : "bill_pay");
    setNewLinkLabel("");
    setNewLinkUrl("");
    const existingMemberAccounts = institution?.id
      ? allMemberAccounts.filter((m) => m.institution_id === institution.id)
      : [];
    const fields: typeof memberFields = {};
    for (const m of members) {
      const existing = existingMemberAccounts.find((a) => a.member_id === m.id);
      fields[m.id] = {
        account_number: existing?.account_number ?? "",
        login_username: existing?.login_username ?? "",
        notes: existing?.notes ?? "",
      };
    }
    setMemberFields(fields);
  }
  if (!open && lastKey !== "") setLastKey("");

  const linkedAccounts = institution?.id
    ? accounts.filter((a) => a.institution_id === institution.id)
    : [];
  const links = institution?.id
    ? allLinks.filter((l) => l.institution_id === institution.id)
    : [];
  const memberAccounts = institution?.id
    ? allMemberAccounts.filter((m) => m.institution_id === institution.id)
    : [];
  const hasBillPay = links.some((l) => l.kind === "bill_pay");
  const hasPatientPortal = links.some((l) => l.kind === "patient_portal");
  // 2 levels only (parent + children, no grandchildren): only an institution
  // with no parent of its own can be chosen as a parent.
  const parentChoices = allInstitutions.filter(
    (i) => i.id !== institution?.id && !i.parent_institution_id,
  );

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
        parent_institution_id: parentId || null,
      });
      await setCats.mutateAsync({ institutionId: id, categoryIds: catIds });
      // ADR-106: save a member-account row for any member with at least one
      // field filled in — a member with everything blank is just left alone
      // (no row created, and an existing-but-now-cleared row isn't deleted
      // here; clear it via its own Remove button instead).
      for (const m of members) {
        const f = memberFields[m.id];
        if (!f) continue;
        if (!f.account_number.trim() && !f.login_username.trim() && !f.notes.trim()) continue;
        await upsertMemberAccount.mutateAsync({
          institution_id: id,
          member_id: m.id,
          account_number: f.account_number.trim() || null,
          login_username: f.login_username.trim() || null,
          notes: f.notes.trim() || null,
        });
      }
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
            {/* Dropdown multi-select — matches the category filter elsewhere. */}
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="mt-1 h-11 w-full justify-between">
                  <span className="truncate">
                    {catIds.length === 0
                      ? "None selected"
                      : categories
                          .filter((c) => catIds.includes(c.id))
                          .map((c) => `${categoryVisual(c).icon} ${c.name}`)
                          .join(", ")}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="max-h-72 w-[--radix-popover-trigger-width] overflow-y-auto p-2">
                {categories.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">No categories yet.</p>
                ) : (
                  categories.map((c) => {
                    const on = catIds.includes(c.id);
                    const visual = categoryVisual(c);
                    return (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={() =>
                            setCatIds((prev) =>
                              on ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                            )
                          }
                        />
                        <span aria-hidden>{visual.icon}</span>
                        <span className="truncate">{c.name}</span>
                      </label>
                    );
                  })
                )}
              </PopoverContent>
            </Popover>
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
            {/* ADR-106: Amazon/Prime-style grouping — a child rolls its
                totals up into its parent on the Institutions screen. Only
                institutions with no parent of their own are offered, to
                keep this to 2 levels. */}
            <Label>Parent institution</Label>
            <Select
              value={parentId || "none"}
              onValueChange={(v) => setParentId(v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None — this is its own institution</SelectItem>
                {parentChoices.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional — e.g. mark "Prime" as part of "Amazon" so its totals
              roll up into Amazon's on the Institutions screen.
            </p>
          </div>
          <div>
            <Label>Main site</Label>
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
            <p className="mt-1 text-xs text-muted-foreground">
              The Log In button opens this when no Bill Pay link is set below.
            </p>
          </div>
          <div>
            {/* ADR-106: additional named links beyond the Main site above. */}
            <Label>Links</Label>
            {!institution?.id ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Save this institution first, then add its links here.
              </p>
            ) : (
              <>
                {links.length > 0 ? (
                  <div className="mt-1 divide-y divide-border/50 rounded-md border">
                    {links.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2 px-2 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">
                            {l.kind === "bill_pay"
                              ? "Bill Pay"
                              : l.kind === "patient_portal"
                                ? "Patient Portal"
                                : l.label || "Other"}
                          </span>
                          <span className="text-muted-foreground"> · {l.url}</span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label="Delete link"
                          onClick={() => deleteLink.mutate(l.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">No extra links yet.</p>
                )}
                <div className="mt-2 space-y-2 rounded-md border p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={newLinkKind}
                      onValueChange={(v) => setNewLinkKind(v as InstitutionLink["kind"])}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {!hasBillPay ? <SelectItem value="bill_pay">Bill Pay</SelectItem> : null}
                        {type === "medical" && !hasPatientPortal ? (
                          <SelectItem value="patient_portal">Patient Portal</SelectItem>
                        ) : null}
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="url"
                      placeholder="https://…"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  {newLinkKind === "other" ? (
                    <Input
                      placeholder="Label (e.g. Support site)"
                      value={newLinkLabel}
                      onChange={(e) => setNewLinkLabel(e.target.value)}
                      className="h-10"
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full"
                    disabled={upsertLink.isPending || !newLinkUrl.trim()}
                    onClick={async () => {
                      if (!newLinkUrl.trim() || !institution?.id) return;
                      try {
                        await upsertLink.mutateAsync({
                          institution_id: institution.id,
                          kind: newLinkKind,
                          label: newLinkKind === "other" ? newLinkLabel.trim() || null : null,
                          url: newLinkUrl.trim(),
                        });
                        setNewLinkKind("other");
                        setNewLinkLabel("");
                        setNewLinkUrl("");
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add link
                  </Button>
                </div>
              </>
            )}
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
            {/* ADR-106: for providers that bill each household member
                separately (vs. combining visits into one joint invoice,
                which needs nothing here). Saved with the main Save button
                below, same as Categories. */}
            <Label>Member accounts</Label>
            {!institution?.id ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Save this institution first, then add member accounts here.
              </p>
            ) : members.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">No household members yet.</p>
            ) : (
              <div className="mt-1 space-y-2">
                {members.map((m) => {
                  const existing = memberAccounts.find((a) => a.member_id === m.id);
                  const f = memberFields[m.id] ?? {
                    account_number: "",
                    login_username: "",
                    notes: "",
                  };
                  return (
                    <div key={m.id} className="space-y-1.5 rounded-md border p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{memberLabel(m)}</span>
                        {existing ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Remove ${memberLabel(m)}'s account`}
                            onClick={() => {
                              deleteMemberAccount.mutate(existing.id);
                              setMemberFields((prev) => ({
                                ...prev,
                                [m.id]: { account_number: "", login_username: "", notes: "" },
                              }));
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : null}
                      </div>
                      <Input
                        placeholder="Account / patient #"
                        value={f.account_number}
                        onChange={(e) =>
                          setMemberFields((prev) => ({
                            ...prev,
                            [m.id]: { ...f, account_number: e.target.value },
                          }))
                        }
                        className="h-9"
                      />
                      <Input
                        placeholder="Login username"
                        value={f.login_username}
                        onChange={(e) =>
                          setMemberFields((prev) => ({
                            ...prev,
                            [m.id]: { ...f, login_username: e.target.value },
                          }))
                        }
                        className="h-9"
                      />
                      <Input
                        placeholder="Notes"
                        value={f.notes}
                        onChange={(e) =>
                          setMemberFields((prev) => ({ ...prev, [m.id]: { ...f, notes: e.target.value } }))
                        }
                        className="h-9"
                      />
                    </div>
                  );
                })}
              </div>
            )}
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
