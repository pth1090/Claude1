import { NextRequest, NextResponse } from "next/server";
import { fetchByDOI } from "@/lib/crossref";
import { summarizeAndCategorize } from "@/lib/claude";
import { normalizeDOI } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawDoi = body?.doi as string | undefined;

    if (!rawDoi || typeof rawDoi !== "string") {
      return NextResponse.json({ error: "Missing 'doi' field" }, { status: 400 });
    }

    const doi = normalizeDOI(rawDoi);
    if (!doi) {
      return NextResponse.json({ error: "Invalid DOI" }, { status: 400 });
    }

    // 1. Fetch metadata from CrossRef
    const crossRefData = await fetchByDOI(doi);

    // 2. Generate AI summary and suggest tags
    const aiResult = await summarizeAndCategorize({
      title: crossRefData.title,
      authors: crossRefData.authors,
      year: crossRefData.year,
      journal: crossRefData.journal,
      abstract: crossRefData.abstract,
    });

    return NextResponse.json({
      doi: crossRefData.doi,
      title: crossRefData.title,
      authors: crossRefData.authors,
      year: crossRefData.year,
      journal: crossRefData.journal,
      abstract: crossRefData.abstract,
      url: crossRefData.url,
      ai_summary: aiResult.summary,
      suggested_product_tags: aiResult.product_tags,
      suggested_focus_tags: aiResult.focus_tags,
      abstract_missing: crossRefData.abstractMissing,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
