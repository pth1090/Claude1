import type { Author } from "./types";

interface CrossRefMessage {
  DOI: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; sequence?: string }>;
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  abstract?: string;
  URL?: string;
}

export interface CrossRefResult {
  doi: string;
  title: string;
  authors: Author[];
  year: number | null;
  journal: string | null;
  abstract: string | null;
  url: string;
  abstractMissing: boolean;
}

function stripJatsXml(text: string): string {
  // Remove JATS XML tags like <jats:p>, <jats:italic>, etc.
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractYear(msg: CrossRefMessage): number | null {
  const parts =
    msg["published-print"]?.["date-parts"]?.[0] ??
    msg["published-online"]?.["date-parts"]?.[0];
  if (parts && parts[0]) return parts[0];
  return null;
}

export async function fetchByDOI(doi: string): Promise<CrossRefResult> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "HitecZangKnowledgeDB/1.0 (mailto:info@hitec-zang.de)",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 404) {
    throw new Error(`DOI not found: ${doi}`);
  }
  if (!res.ok) {
    throw new Error(`CrossRef API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { message: CrossRefMessage };
  const msg = data.message;

  const title = msg.title?.[0] ?? "Untitled";

  const authors: Author[] = (msg.author ?? [])
    .filter((a) => a.family)
    .map((a) => ({
      given: a.given ?? "",
      family: a.family!,
    }));

  const rawAbstract = msg.abstract ?? null;
  const abstract = rawAbstract ? stripJatsXml(rawAbstract) : null;

  return {
    doi: msg.DOI ?? doi,
    title,
    authors,
    year: extractYear(msg),
    journal: msg["container-title"]?.[0] ?? null,
    abstract,
    url: msg.URL ?? `https://doi.org/${doi}`,
    abstractMissing: !abstract,
  };
}
