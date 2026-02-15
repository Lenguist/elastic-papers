import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getLibrary } from "@/lib/library";
import { searchPapers, getPaper } from "@/lib/elasticsearch";
import { searchProjectPapers } from "@/lib/paper-index";
import { createNote } from "@/lib/notes";
import type { LibraryPaper } from "@/lib/library-store";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o";

// Kibana Agent Builder (for "deep research" tool)
const KIBANA_URL = process.env.KIBANA_URL?.replace(/\/$/, "");
const KIBANA_API_KEY = process.env.KIBANA_API_KEY;
const AGENT_ID = process.env.AGENT_ID || "basic-arxiv-assistant";

// Modal deployment endpoint
const MODAL_ENDPOINT_URL = process.env.MODAL_ENDPOINT_URL;

// ─── Tool definitions ────────────────────────────────────────────────────────

// Tools are built per-request so we can inject the projectId into descriptions
function buildTools(projectId: string): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return [
    {
      type: "function",
      function: {
        name: "search_papers",
        description:
          "Search the full arXiv paper database (100k+ papers) using Elasticsearch with Jina semantic embeddings. " +
          "Use this to DISCOVER new papers on a topic. " +
          "Returns titles, abstracts, authors, and arXiv IDs.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query. Be specific and descriptive for better semantic matching.",
            },
            num_results: {
              type: "number",
              description: "Number of results to return (default 8, max 20).",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_library_papers",
        description:
          "Search over the FULL TEXT of papers that the user has added to their library for this project. " +
          "Each paper's PDF has been fetched, extracted, chunked, and indexed with Jina semantic embeddings in a per-project Elasticsearch index. " +
          "Use this to answer detailed questions about papers in the library — benchmarks, methods, results, comparisons, specific sections. " +
          "This is the RAG tool: it retrieves the most relevant passages from the papers the user is working with.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The question or search query to find relevant passages in library papers.",
            },
            num_results: {
              type: "number",
              description: "Number of passages to retrieve (default 6, max 15).",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_paper_details",
        description:
          "Get full details of a specific paper by its arXiv ID from the global database. " +
          "Use this when the user asks about a specific paper or you need more details about a paper from search results.",
        parameters: {
          type: "object",
          properties: {
            arxiv_id: {
              type: "string",
              description: "The arXiv ID (e.g., '2601.12345').",
            },
          },
          required: ["arxiv_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "deep_research",
        description:
          "Use the Elastic Agent Builder for a more thorough, multi-step research query. " +
          "This is slower (10-15 seconds) but uses Elastic's full agent pipeline with reasoning and workflow-based search. " +
          "Use this when the user explicitly asks for a deep or thorough search, or when regular search didn't find good results.",
        parameters: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The research question to investigate thoroughly.",
            },
          },
          required: ["question"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "save_to_notes",
        description:
          "Save content to the user's project notes. Use this when the user asks you to save, write down, or record " +
          "something — comparisons, summaries, key findings, analysis, or any research notes. " +
          "You can optionally link the note to a specific paper by providing its arXiv ID. " +
          "Always confirm to the user what you saved.",
        parameters: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "The note content to save. Use markdown formatting for structure (headers, bullet points, etc.).",
            },
            paper_id: {
              type: "string",
              description: "Optional arXiv ID to link this note to a specific paper in the library.",
            },
          },
          required: ["content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "deploy_paper_demo",
        description:
          "Deploy and run a paper's code in a cloud sandbox (Modal). " +
          "This spins up a container, clones the GitHub repo, and uses an AI coding agent (Claude) " +
          "to read the README, install dependencies, debug issues, and get the code running. " +
          "Use this when the user asks to 'run this paper's code', 'get this demo working', 'try running the code', etc. " +
          "The agent will attempt to get the code running and report back with results or explain why it couldn't. " +
          "This can take 1-5 minutes. Tell the user it's working before calling this tool.",
        parameters: {
          type: "object",
          properties: {
            repo_url: {
              type: "string",
              description:
                "The GitHub repository URL to deploy (e.g. 'https://github.com/user/repo'). " +
                "If you know the repo URL from the paper's code links, use it directly. " +
                "If you don't have it, check the paper's metadata or ask the user.",
            },
            paper_id: {
              type: "string",
              description:
                "The arXiv ID of the paper whose code to deploy. " +
                "If provided without repo_url, the system will look up the paper's GitHub link from the library.",
            },
            task: {
              type: "string",
              description:
                "Optional specific instructions for the deployment agent, e.g. " +
                "'Run the inference demo on the test dataset' or 'Start the Gradio UI'. " +
                "If not provided, the agent will follow the README.",
            },
          },
          required: [],
        },
      },
    },
  ];
}

// ─── Tool execution ──────────────────────────────────────────────────────────

async function executeSearchPapers(query: string, numResults?: number): Promise<string> {
  const size = Math.min(Math.max(numResults || 8, 1), 20);
  const { papers, took, total, index } = await searchPapers(query, size);

  if (papers.length === 0) {
    return JSON.stringify({ message: "No papers found.", took, total: 0, index });
  }

  const results = papers.map((p) => ({
    arxiv_id: p.arxivId,
    title: p.title,
    abstract: p.abstract.slice(0, 400) + (p.abstract.length > 400 ? "..." : ""),
    authors: p.authors.slice(0, 5),
    categories: p.categories,
    created: p.created,
    score: p.score,
    url: `https://arxiv.org/abs/${p.arxivId}`,
  }));

  return JSON.stringify({ results, took, total, index });
}

async function executeGetPaperDetails(arxivId: string): Promise<string> {
  const paper = await getPaper(arxivId);
  if (!paper) return JSON.stringify({ error: "Paper not found", arxiv_id: arxivId });
  return JSON.stringify({
    arxiv_id: paper.arxivId,
    title: paper.title,
    abstract: paper.abstract,
    authors: paper.authors,
    categories: paper.categories,
    created: paper.created,
    url: `https://arxiv.org/abs/${paper.arxivId}`,
    pdf_url: `https://arxiv.org/pdf/${paper.arxivId}.pdf`,
  });
}

async function executeDeepResearch(question: string): Promise<string> {
  if (!KIBANA_URL || !KIBANA_API_KEY) {
    return JSON.stringify({ error: "Kibana not configured" });
  }

  const url = `${KIBANA_URL}/api/agent_builder/converse`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `ApiKey ${KIBANA_API_KEY}`,
      "kbn-xsrf": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: question,
      agent_id: AGENT_ID,
      connector_id: "OpenAI-GPT-4-1-Mini",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return JSON.stringify({ error: `Agent API ${res.status}`, detail: text.slice(0, 300) });
  }

  const data = (await res.json()) as Record<string, unknown>;
  
  // Extract the answer and tool steps for context
  let answer = "";
  if (typeof data.response === "object" && data.response) {
    const resp = data.response as Record<string, unknown>;
    if (typeof resp.message === "string") answer = resp.message;
  } else if (typeof data.message === "string") {
    answer = data.message;
  } else if (typeof data.response === "string") {
    answer = data.response;
  }

  // Include steps summary for transparency
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const toolCalls = steps
    .filter((s: Record<string, unknown>) => s.type === "tool_call")
    .map((s: Record<string, unknown>) => ({
      tool: s.tool_id,
      params: s.params,
    }));

  return JSON.stringify({
    answer,
    tool_calls_made: toolCalls,
    model_usage: data.model_usage,
    time_to_last_token: data.time_to_last_token,
  });
}

async function executeDeployPaperDemo(
  projectId: string,
  repoUrl?: string,
  paperId?: string,
  task?: string
): Promise<string> {
  if (!MODAL_ENDPOINT_URL) {
    return JSON.stringify({
      error: "Modal deployment not configured. Set MODAL_ENDPOINT_URL in env.",
    });
  }

  // Call our own deploy-demo API route which handles resolution + Modal call
  const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "http://localhost:3000";
  const apiUrl = `${baseUrl}/api/deploy-demo`;

  const body: Record<string, string> = {};
  if (repoUrl) body.repo_url = repoUrl;
  if (paperId) body.paper_id = paperId;
  if (projectId) body.project_id = projectId;
  if (task) body.task = task;

  try {
    console.log(`  🚀 Deploying paper demo: ${repoUrl || paperId}`);
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return JSON.stringify({
        error: data.error || `Deploy API returned ${res.status}`,
        detail: data.detail || "",
      });
    }

    // Return a summary the orchestrator can present nicely
    return JSON.stringify({
      status: data.status,
      summary: data.summary,
      repo_url: data.repo_url,
      step_count: data.step_count,
      elapsed_seconds: data.elapsed_seconds,
      // Include a few key steps for the orchestrator's context
      key_steps: (data.steps || []).slice(-5).map((s: Record<string, unknown>) => ({
        command: s.command,
        exit_code: s.exit_code,
      })),
    });
  } catch (err) {
    return JSON.stringify({
      error: "Failed to call deploy-demo API",
      detail: (err as Error).message?.slice(0, 300),
    });
  }
}

async function executeSaveToNotes(projectId: string, content: string, paperId?: string): Promise<string> {
  try {
    const note = await createNote(projectId, content, paperId || undefined);
    if (!note) {
      return JSON.stringify({ error: "Failed to save note" });
    }
    return JSON.stringify({
      success: true,
      note_id: note.id,
      paper_id: paperId || null,
      content_length: content.length,
    });
  } catch (err) {
    return JSON.stringify({ error: "Failed to save note: " + (err as Error).message });
  }
}

async function executeSearchLibraryPapers(projectId: string, query: string, numResults?: number): Promise<string> {
  const size = Math.min(Math.max(numResults || 6, 1), 15);
  const { results, took, indexName } = await searchProjectPapers(projectId, query, size);

  if (results.length === 0) {
    return JSON.stringify({
      message: "No relevant passages found in library papers. The papers may not have been indexed yet (PDF processing takes a few seconds after adding to library).",
      took,
      indexName,
    });
  }

  const passages = results.map((r) => ({
    arxiv_id: r.arxivId,
    title: r.title,
    passage: r.chunkText,
    chunk_index: r.chunkIndex,
    total_chunks: r.totalChunks,
    score: r.score,
  }));

  return JSON.stringify({ passages, took, indexName, total_passages: passages.length });
}

// Paper type returned to the frontend for interactive selection
type ReturnedPaper = {
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];
  created: string;
  score: number;
  url: string;
};

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  collectedPapers: Map<string, ReturnedPaper>,
  projectId: string
): Promise<string> {
  console.log(`  🔧 Tool call: ${name}(${JSON.stringify(args)})`);
  const start = Date.now();

  let result: string;
  switch (name) {
    case "search_papers":
      result = await executeSearchPapers(args.query as string, args.num_results as number | undefined);
      // Collect papers from results for frontend
      try {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed.results)) {
          for (const p of parsed.results) {
            if (p.arxiv_id && !collectedPapers.has(p.arxiv_id)) {
              collectedPapers.set(p.arxiv_id, {
                arxiv_id: p.arxiv_id,
                title: p.title || "",
                abstract: p.abstract || "",
                authors: p.authors || [],
                categories: p.categories || [],
                created: p.created || "",
                score: p.score || 0,
                url: `https://arxiv.org/abs/${p.arxiv_id}`,
              });
            }
          }
        }
      } catch { /* ignore parse errors */ }
      break;
    case "get_paper_details":
      result = await executeGetPaperDetails(args.arxiv_id as string);
      try {
        const p = JSON.parse(result);
        if (p.arxiv_id && !collectedPapers.has(p.arxiv_id)) {
          collectedPapers.set(p.arxiv_id, {
            arxiv_id: p.arxiv_id,
            title: p.title || "",
            abstract: p.abstract || "",
            authors: p.authors || [],
            categories: p.categories || [],
            created: p.created || "",
            score: 0,
            url: `https://arxiv.org/abs/${p.arxiv_id}`,
          });
        }
      } catch { /* ignore */ }
      break;
    case "search_library_papers":
      result = await executeSearchLibraryPapers(projectId, args.query as string, args.num_results as number | undefined);
      break;
    case "deep_research":
      result = await executeDeepResearch(args.question as string);
      break;
    case "save_to_notes":
      result = await executeSaveToNotes(projectId, args.content as string, args.paper_id as string | undefined);
      break;
    case "deploy_paper_demo":
      result = await executeDeployPaperDemo(
        projectId,
        args.repo_url as string | undefined,
        args.paper_id as string | undefined,
        args.task as string | undefined
      );
      break;
    default:
      result = JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  console.log(`  ✅ ${name} completed in ${Date.now() - start}ms`);
  return result;
}

// ─── Library context builder ─────────────────────────────────────────────────

function buildLibraryContext(papers: LibraryPaper[]): string {
  if (papers.length === 0) return "";
  const lines = papers.map((p, i) => {
    const parts = [
      `Title: ${p.title}`,
      `arXiv ID: ${p.id}`,
      p.abstract ? `Abstract: ${p.abstract.slice(0, 300)}${p.abstract.length > 300 ? "..." : ""}` : "",
      p.authors?.length ? `Authors: ${p.authors.slice(0, 5).join(", ")}` : "",
    ].filter(Boolean).join("\n");
    return `[Paper ${i + 1}]\n${parts}`;
  });
  return "Papers in the user's library:\n\n" + lines.join("\n\n");
}

// ─── System prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(libraryContext: string): string {
  return `You are a research assistant for an academic paper discovery and analysis tool called Research Atelier.

You help researchers find, understand, and compare academic papers from arXiv. You have access to an Elasticsearch database with 100k+ computer science papers indexed with Jina semantic embeddings.

TOOLS:
- search_papers: Search the GLOBAL arXiv database (100k+ papers) for discovering new papers. Fast (~300ms).
- search_library_papers: Search over the FULL TEXT of papers in the user's project library. Each paper's PDF has been chunked and indexed with Jina semantic embeddings. Use this for detailed questions about papers the user is working with (benchmarks, methods, results, comparisons). This is your RAG tool.
- get_paper_details: Get abstract and metadata for a specific paper by arXiv ID.
- deep_research: Thorough search via Elastic Agent Builder (10-15s). Only when asked or regular search fails.
- save_to_notes: Save content to the user's project notes. Optionally link to a specific paper by arXiv ID. Use when the user asks to save, record, or write down findings, comparisons, summaries, or analysis.
- deploy_paper_demo: Run a paper's code in a cloud sandbox (Modal). An AI coding agent (Claude) will clone the repo, read the README, install deps, and try to get the code running. Takes 1-5 minutes. Use when the user asks to "run this code", "get this demo working", "try the paper's code", etc.

WHEN TO USE WHICH TOOL:
- "Find papers about X" → search_papers (discover new papers)
- "What benchmarks does paper Y use?" → search_library_papers (answer from library paper full text)
- "Compare these two papers" → search_library_papers (retrieve relevant sections from both)
- "Compare and save to notes" → search_library_papers, then save_to_notes with the comparison
- "Summarize the methods in my library" → search_library_papers
- "Save this to my notes" → save_to_notes
- "What's the state of the art in X?" → search_papers first, maybe search_library_papers if library has relevant papers
- "Run this paper's code" / "Get the demo working" → deploy_paper_demo (tell the user it will take a few minutes, then call the tool)

GUIDELINES:
- When citing papers, ALWAYS format as: **[Full Title](https://arxiv.org/abs/ARXIV_ID)**
- When the user asks about a topic, use search_papers to find relevant work before answering.
- When the user asks about papers in their library, ALWAYS use search_library_papers to get actual text from the papers. Do not rely on the brief context below — use the tool.
- Be specific and informative. Cite specific passages, numbers, and results from retrieved text.
- If the user has papers in their library, reference them when relevant.
- If search results don't seem relevant enough, try rephrasing the query or use deep_research.
- When saving to notes, write well-structured markdown content. After saving, confirm to the user what was saved.

${libraryContext ? "\n" + libraryContext + "\n" : ""}`;
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = (body.message as string)?.trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const projectId = body.project_id as string | undefined;
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Set OPENAI_API_KEY in env" }, { status: 500 });
  }

  // Get library papers for context
  let papers = await getLibrary(projectId);
  const selectedIds = body.selected_paper_ids as string[] | undefined;
  if (Array.isArray(selectedIds) && selectedIds.length > 0) {
    const idSet = new Set(selectedIds.map((id) => String(id).trim()).filter(Boolean));
    papers = papers.filter((p) => idSet.has(p.id));
  }
  const libraryContext = buildLibraryContext(papers);

  // Build conversation from history + new message
  const history = body.history as Array<{ role: string; text: string }> | undefined;
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(libraryContext) },
  ];

  // Add conversation history if provided
  if (Array.isArray(history)) {
    for (const msg of history) {
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.text });
      } else if (msg.role === "assistant") {
        messages.push({ role: "assistant", content: msg.text });
      }
      // skip system and error messages from history
    }
  }

  // Add the current message
  messages.push({ role: "user", content: message });

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  CHAT: OpenAI Orchestrator                              ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("Message:", message.slice(0, 100));
  console.log("Library papers:", papers.length);
  console.log("History messages:", history?.length ?? 0);
  console.log("");

  const startTime = Date.now();

  // Collect papers found by tools for structured return to frontend
  const collectedPapers = new Map<string, ReturnedPaper>();
  const tools = buildTools(projectId);

  try {
    // Tool-use loop: call OpenAI, execute tools, feed results back, repeat
    let response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 4096,
    });

    let loopCount = 0;
    const MAX_LOOPS = 8;

    while (response.choices[0]?.finish_reason === "tool_calls" && loopCount < MAX_LOOPS) {
      loopCount++;
      const toolCalls = response.choices[0].message.tool_calls ?? [];
      console.log(`  Loop ${loopCount}: ${toolCalls.length} tool call(s)`);

      // Add assistant message with tool calls
      messages.push(response.choices[0].message);

      // Execute each tool call and add results
      for (const tc of toolCalls) {
        if (tc.type !== "function") continue;
        const args = JSON.parse(tc.function.arguments);
        const result = await executeTool(tc.function.name, args, collectedPapers, projectId);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Call OpenAI again with tool results
      response = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 2000,
      });
    }

    const elapsed = Date.now() - startTime;
    const text = response.choices[0]?.message?.content ?? "";
    const usage = response.usage;

    console.log(`\n  Total time: ${elapsed}ms`);
    console.log(`  Tool loops: ${loopCount}`);
    console.log(`  Papers found: ${collectedPapers.size}`);
    console.log(`  Tokens: ${usage?.prompt_tokens ?? "?"}in / ${usage?.completion_tokens ?? "?"}out`);
    console.log("═══════════════════════════════════════════════════════════\n");

    return NextResponse.json({
      response: text,
      papers: Array.from(collectedPapers.values()),
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`  Error after ${elapsed}ms:`, (err as Error).message);
    return NextResponse.json(
      { error: "Chat failed", detail: (err as Error).message?.slice(0, 300) },
      { status: 502 }
    );
  }
}
