import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { dbListProjects, dbCreateProject, dbDeleteProject, hasDb } from "@/lib/db";
import { deleteProjectIndex } from "@/lib/paper-index";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Generate a short project name from a description using OpenAI. */
async function generateProjectName(description: string): Promise<string> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You generate short, catchy project names (2-4 words max) from a research description. " +
            "Return ONLY the name, nothing else. No quotes, no punctuation, no explanation. " +
            "Examples: 'Ukrainian QA Models', 'LLM Code Safety', 'Vision Transformers Survey'.",
        },
        { role: "user", content: description },
      ],
      max_tokens: 20,
      temperature: 0.7,
    });
    const name = res.choices[0]?.message?.content?.trim();
    if (name && name.length > 0 && name.length < 80) return name;
    // fallback: first few words of description
    return description.split(/\s+/).slice(0, 4).join(" ");
  } catch {
    // If OpenAI fails, use first few words of description
    return description.split(/\s+/).slice(0, 4).join(" ");
  }
}

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ projects: [], _source: "no_db" });
  }
  const projects = await dbListProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  let body: { description?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const description = String(body.description ?? "").trim();
  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  // Use provided name or generate one from description
  const name = body.name?.trim() || (await generateProjectName(description));

  if (!hasDb()) {
    // Return a fake project for in-memory mode
    return NextResponse.json({
      project: {
        id: `mem-${Date.now()}`,
        name,
        description,
        createdAt: new Date().toISOString(),
      },
    });
  }

  const project = await dbCreateProject(name, description);
  if (!project) {
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
  return NextResponse.json({ project });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("id");
  if (!projectId) {
    return NextResponse.json({ error: "id param required" }, { status: 400 });
  }
  // Clean up the per-project Elasticsearch index (paper chunks + embeddings)
  try {
    await deleteProjectIndex(projectId);
  } catch (err) {
    console.error("Failed to delete project ES index:", (err as Error).message);
    // Continue with DB deletion even if ES cleanup fails
  }
  await dbDeleteProject(projectId);
  return NextResponse.json({ ok: true });
}
