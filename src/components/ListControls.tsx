import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, Search } from "lucide-react";
import type { Category } from "@/lib/supabase";

export type Option = { value: string; label: string };

export function ListControls({
  query,
  onQueryChange,
  sort,
  onSortChange,
  sortOptions,
  group,
  onGroupChange,
  groupOptions,
  categories,
  selectedCategories,
  onSelectedCategoriesChange,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  sort: string;
  onSortChange: (v: string) => void;
  sortOptions: Option[];
  group: string;
  onGroupChange: (v: string) => void;
  groupOptions: Option[];
  categories: Category[];
  selectedCategories: string[];
  onSelectedCategoriesChange: (v: string[]) => void;
}) {
  function toggle(id: string) {
    onSelectedCategoriesChange(
      selectedCategories.includes(id)
        ? selectedCategories.filter((c) => c !== id)
        : [...selectedCategories, id],
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="h-12 pl-9"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                Sort: {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={group} onValueChange={onGroupChange}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Group: None</SelectItem>
            {groupOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                Group: {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-11 w-full justify-start">
            <Filter className="mr-2 h-4 w-4" />
            {selectedCategories.length === 0
              ? "Filter: All categories"
              : `Filter: ${selectedCategories.length} categor${selectedCategories.length === 1 ? "y" : "ies"}`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="max-h-72 w-64 overflow-y-auto p-2">
          <button
            type="button"
            className="mb-1 w-full rounded px-2 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
            onClick={() => onSelectedCategoriesChange([])}
          >
            Clear filters
          </button>
          <label className="flex items-center gap-3 rounded px-2 py-2 text-sm hover:bg-accent">
            <Checkbox
              checked={selectedCategories.includes("none")}
              onCheckedChange={() => toggle("none")}
              className="h-5 w-5"
            />
            Uncategorized
          </label>
          {categories.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-3 rounded px-2 py-2 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={selectedCategories.includes(c.id)}
                onCheckedChange={() => toggle(c.id)}
                className="h-5 w-5"
              />
              {c.name}
            </label>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function groupRows<T>(rows: T[], keyFn: (row: T) => string): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
