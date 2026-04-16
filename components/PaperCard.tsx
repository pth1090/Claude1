import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatAuthors } from "@/lib/utils";
import type { Paper } from "@/lib/types";

interface PaperCardProps {
  paper: Paper;
}

export function PaperCard({ paper }: PaperCardProps) {
  const productTags = paper.tags.filter((t) => t.type === "product");
  const focusTags = paper.tags.filter((t) => t.type === "focus");

  return (
    <Card className="flex flex-col h-full hover:shadow-md transition-shadow group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/papers/${paper.id}`} className="flex-1">
            <CardTitle className="line-clamp-3 text-base group-hover:text-primary transition-colors leading-snug">
              {paper.title}
            </CardTitle>
          </Link>
          {paper.year && (
            <span className="shrink-0 text-xs font-semibold text-muted-foreground bg-muted rounded px-1.5 py-0.5 mt-0.5">
              {paper.year}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground italic mt-1">
          {formatAuthors(paper.authors)}
          {paper.journal && (
            <span className="not-italic"> · {paper.journal}</span>
          )}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 gap-3 pt-0">
        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {productTags.map((t) => (
            <Badge key={t.id} variant="product">
              {t.name}
            </Badge>
          ))}
          {focusTags.map((t) => (
            <Badge key={t.id} variant="focus">
              {t.name}
            </Badge>
          ))}
        </div>

        {/* AI Summary or Abstract */}
        {(paper.ai_summary || paper.abstract) && (
          <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
            {paper.ai_summary || paper.abstract}
          </p>
        )}

        {/* Footer links */}
        <div className="flex items-center justify-between mt-auto pt-1">
          <Link
            href={`/papers/${paper.id}`}
            className="text-xs text-primary hover:underline font-medium"
          >
            Details ansehen
          </Link>
          {paper.url && (
            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              DOI
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
