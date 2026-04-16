import { NextRequest, NextResponse } from "next/server";
import { getPaperById, updatePaper, deletePaper } from "@/db/database";
import type { UpdatePaperRequest } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const paper = getPaperById(id);
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(paper);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  try {
    const body: UpdatePaperRequest = await req.json();
    const paper = updatePaper(id, body);
    if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(paper);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const deleted = deletePaper(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
