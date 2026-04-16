import { NextRequest, NextResponse } from "next/server";
import { getPapers, createPaper, getTagsWithCounts } from "@/db/database";
import type { CreatePaperRequest } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const q = searchParams.get("q") ?? undefined;
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : undefined;
    const productsParam = searchParams.get("product");
    const focusesParam = searchParams.get("focus");

    const products = productsParam
      ? productsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    const focuses = focusesParam
      ? focusesParam.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const papers = getPapers({ products, focuses, q, year });
    const tags = getTagsWithCounts();

    return NextResponse.json({ papers, total: papers.length, tags });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: CreatePaperRequest = await req.json();

    if (!body.doi || !body.title) {
      return NextResponse.json(
        { error: "Missing required fields: doi, title" },
        { status: 400 }
      );
    }

    const paper = createPaper({
      doi: body.doi,
      title: body.title,
      authors: body.authors ?? [],
      year: body.year ?? null,
      journal: body.journal ?? null,
      abstract: body.abstract ?? null,
      ai_summary: body.ai_summary ?? null,
      notes: body.notes ?? null,
      url: body.url ?? null,
      product_tags: body.product_tags ?? [],
      focus_tags: body.focus_tags ?? [],
    });

    return NextResponse.json(paper, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // SQLite UNIQUE constraint
    if (message.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "A paper with this DOI already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
