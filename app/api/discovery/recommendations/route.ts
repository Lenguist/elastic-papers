import { NextRequest, NextResponse } from "next/server";
import { getLibrary } from "@/lib/library";
import { getRecommendations } from "@/lib/recommendations";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");

  if (!projectId) {
    return NextResponse.json(
      { error: "project_id is required", papers: [], source: "error" },
      { status: 400 }
    );
  }

  try {
    const libraryPapers = await getLibrary(projectId);

    if (libraryPapers.length === 0) {
      return NextResponse.json({ papers: [], source: "empty_library" });
    }

    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)),
      50
    );

    const { papers, source } = await getRecommendations(libraryPapers, limit);
    return NextResponse.json({ papers, source });
  } catch (err) {
    console.error("Recommendations API error:", (err as Error).message);
    return NextResponse.json(
      { papers: [], source: "error", error: (err as Error).message },
      { status: 500 }
    );
  }
}
