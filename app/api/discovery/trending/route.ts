import { NextRequest, NextResponse } from "next/server";
import { fetchRecentByCategory } from "@/lib/arxiv";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? "cs.AI";
  const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)), 50);
  const papers = await fetchRecentByCategory(category, limit);
  return NextResponse.json({ papers });
}
