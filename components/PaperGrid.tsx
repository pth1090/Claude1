import { BookOpen } from "lucide-react";
import { PaperCard } from "./PaperCard";
import type { Paper } from "@/lib/types";

interface PaperGridProps {
  papers: Paper[];
}

export function PaperGrid({ papers }: PaperGridProps) {
  if (papers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-base font-semibold text-muted-foreground">
          Keine Publikationen gefunden
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Versuche andere Filter oder füge eine neue Publikation über DOI hinzu.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {papers.map((paper) => (
        <PaperCard key={paper.id} paper={paper} />
      ))}
    </div>
  );
}
