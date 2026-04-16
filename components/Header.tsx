"use client";

import { FlaskConical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  paperCount: number;
  onAddPaper: () => void;
}

export function Header({ paperCount, onAddPaper }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <FlaskConical className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight text-foreground">
                Hitec Zang
              </h1>
              <p className="text-xs text-muted-foreground leading-tight">
                Research Knowledge Database
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-muted-foreground">
              {paperCount} {paperCount === 1 ? "Publikation" : "Publikationen"}
            </span>
            <Button onClick={onAddPaper} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span>Paper hinzufügen</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
