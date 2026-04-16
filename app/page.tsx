"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { FilterSidebar } from "@/components/FilterSidebar";
import { FilterChips } from "@/components/FilterChips";
import { SearchBar } from "@/components/SearchBar";
import { PaperGrid } from "@/components/PaperGrid";
import { AddPaperDialog } from "@/components/AddPaperDialog";
import type { Paper, TagWithCount } from "@/lib/types";

function HomeContent() {
  const searchParams = useSearchParams();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [products, setProducts] = useState<TagWithCount[]>([]);
  const [focuses, setFocuses] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const q = searchParams.get("q") ?? undefined;
  const selectedProducts = searchParams.get("product")?.split(",").filter(Boolean) ?? [];
  const selectedFocuses = searchParams.get("focus")?.split(",").filter(Boolean) ?? [];

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (selectedProducts.length) params.set("product", selectedProducts.join(","));
    if (selectedFocuses.length) params.set("focus", selectedFocuses.join(","));

    fetch(`/api/papers?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setPapers(data.papers ?? []);
        setProducts(data.tags?.products ?? []);
        setFocuses(data.tags?.focuses ?? []);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  return (
    <div className="min-h-screen bg-background">
      <Header paperCount={papers.length} onAddPaper={() => setDialogOpen(true)} />

      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-24">
              <FilterSidebar
                products={products}
                focuses={focuses}
                selectedProducts={selectedProducts}
                selectedFocuses={selectedFocuses}
              />
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            <div className="mb-4">
              <SearchBar defaultValue={q} />
            </div>
            <FilterChips
              selectedProducts={selectedProducts}
              selectedFocuses={selectedFocuses}
            />
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-56 rounded-lg border bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <PaperGrid papers={papers} />
            )}
          </main>
        </div>
      </div>

      <AddPaperDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
