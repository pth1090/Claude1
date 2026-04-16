"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { TagWithCount } from "@/lib/types";

interface FilterSidebarProps {
  products: TagWithCount[];
  focuses: TagWithCount[];
  selectedProducts: string[];
  selectedFocuses: string[];
}

export function FilterSidebar({
  products,
  focuses,
  selectedProducts,
  selectedFocuses,
}: FilterSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (type: "product" | "focus", name: string, checked: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      const key = type;
      const current = params.get(key)?.split(",").filter(Boolean) ?? [];
      const updated = checked ? [...current, name] : current.filter((v) => v !== name);
      if (updated.length > 0) {
        params.set(key, updated.join(","));
      } else {
        params.delete(key);
      }
      router.push(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const clearAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("product");
    params.delete("focus");
    const q = params.get("q");
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/", { scroll: false });
  }, [router, searchParams]);

  const hasFilters = selectedProducts.length > 0 || selectedFocuses.length > 0;

  return (
    <aside className="w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Filter
        </h2>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 px-2 text-xs gap-1">
            <X className="h-3 w-3" />
            Alle löschen
          </Button>
        )}
      </div>

      {/* Products */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Produkte
        </p>
        <div className="space-y-2">
          {products.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2">
              <Checkbox
                id={`product-${tag.id}`}
                checked={selectedProducts.includes(tag.name)}
                onCheckedChange={(checked) =>
                  updateFilter("product", tag.name, checked === true)
                }
              />
              <Label
                htmlFor={`product-${tag.id}`}
                className="flex flex-1 cursor-pointer items-center justify-between text-sm font-normal"
              >
                <span>{tag.name}</span>
                <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                  {tag.count}
                </span>
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator className="mb-5" />

      {/* Research Focus */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Forschungsbereich
        </p>
        <div className="space-y-2">
          {focuses.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2">
              <Checkbox
                id={`focus-${tag.id}`}
                checked={selectedFocuses.includes(tag.name)}
                onCheckedChange={(checked) =>
                  updateFilter("focus", tag.name, checked === true)
                }
              />
              <Label
                htmlFor={`focus-${tag.id}`}
                className="flex flex-1 cursor-pointer items-center justify-between text-sm font-normal"
              >
                <span>{tag.name}</span>
                <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                  {tag.count}
                </span>
              </Label>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
