"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { X } from "lucide-react";

interface FilterChipsProps {
  selectedProducts: string[];
  selectedFocuses: string[];
}

export function FilterChips({ selectedProducts, selectedFocuses }: FilterChipsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const removeProduct = useCallback(
    (name: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const updated = selectedProducts.filter((v) => v !== name);
      if (updated.length > 0) params.set("product", updated.join(","));
      else params.delete("product");
      router.push(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, selectedProducts]
  );

  const removeFocus = useCallback(
    (name: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const updated = selectedFocuses.filter((v) => v !== name);
      if (updated.length > 0) params.set("focus", updated.join(","));
      else params.delete("focus");
      router.push(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, selectedFocuses]
  );

  if (selectedProducts.length === 0 && selectedFocuses.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {selectedProducts.map((name) => (
        <button
          key={`p-${name}`}
          onClick={() => removeProduct(name)}
          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200 transition-colors"
        >
          {name}
          <X className="h-3 w-3" />
        </button>
      ))}
      {selectedFocuses.map((name) => (
        <button
          key={`f-${name}`}
          onClick={() => removeFocus(name)}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-200 transition-colors"
        >
          {name}
          <X className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}
