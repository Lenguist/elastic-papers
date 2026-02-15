"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import SandboxPanel from "./components/SandboxPanel";

type ChatPaper = {
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];
  created: string;
  score: number;
  url: string;
};

type Message = {
  role: "user" | "assistant" | "error" | "system";
  text: string;
  papers?: ChatPaper[];
};

type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
};

export default function HomePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><span className="text-zinc-400">Loading...</span></div>}>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const searchParams = useSearchParams();
  const [scopeDefined, setScopeDefined] = useState(false);
  const [scopeInput, setScopeInput] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"library" | "notes" | "code">("library");
  const [codeLinks, setCodeLinks] = useState<Array<{ paperId: string; paperTitle: string; url: string; repoName: string }>>([]);
  const [libraryPapers, setLibraryPapers] = useState<Array<{
    id: string;
    title: string;
    authors?: string[];
    url?: string;
    abstract?: string;
    pdfUrl?: string;
    addedAt?: string;
    publishedYear?: string;
    publishedDate?: string;
    approved?: boolean;
    githubLinks?: string[];
  }>>([]);
  const [authorsExpanded, setAuthorsExpanded] = useState<Set<string>>(new Set());
  const [abstractExpanded, setAbstractExpanded] = useState<Set<string>>(new Set());
  const [savedToLibraryMessageIndices, setSavedToLibraryMessageIndices] = useState<Set<number>>(new Set());
  const [savedToNotesMessageIndices, setSavedToNotesMessageIndices] = useState<Set<number>>(new Set());
  const [chatPaperSelections, setChatPaperSelections] = useState<Record<number, Set<string>>>({});
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Array<{ id: string; content: string; paperId: string | null; createdAt: string; updatedAt: string }>>([]);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [paperNoteDrafts, setPaperNoteDrafts] = useState<Record<string, string>>({});
  const [showNotesForPaper, setShowNotesForPaper] = useState<Set<string>>(new Set());
  const [addNoteOpenForPaper, setAddNoteOpenForPaper] = useState<Set<string>>(new Set());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  // Modal deploy state: maps repo URL → status
  const [deployStatus, setDeployStatus] = useState<Record<string, {
    loading: boolean;
    statusMessage?: string;
    result?: {
      status: string;
      summary: string;
      steps?: Array<{ step: number; command: string; exit_code: number; output: string }>;
      step_count?: number;
      elapsed_seconds?: number;
    };
    error?: string;
  }>>({});
  const [expandedDeploy, setExpandedDeploy] = useState<string | null>(null);
  const [envVarsInput, setEnvVarsInput] = useState<Record<string, string>>({}); // repo URL → env vars text
  const [showEnvForm, setShowEnvForm] = useState<string | null>(null); // repo URL to show form for
  const [sandboxRepo, setSandboxRepo] = useState<{ url: string; name: string } | null>(null); // active sandbox session
  const [sandboxMinimized, setSandboxMinimized] = useState(false); // minimize instead of close
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // ─── Auto-load project from URL ?project=ID&name=NAME ────────────────────
  useEffect(() => {
    const pid = searchParams.get("project");
    const pname = searchParams.get("name");
    if (pid && !projectId) {
      setProjectId(pid);
      setProjectName(pname || "Project");
      setScopeDefined(true);
      setMessages([
        {
          role: "system",
          text: `Resumed project "${pname || "Project"}".\n\nYour library and notes are preserved. Ask questions, search for papers, or continue your research.`,
        },
      ]);
    }
  }, [searchParams, projectId]);

  // ─── Helper: auto-inject project_id into all API calls ──────────────────
  // This is the "one place" fix for threading project_id everywhere.
  // Instead of changing 15+ individual fetch calls, everything goes through this.
  const apiFetch = useCallback(
    (url: string, options?: RequestInit): Promise<Response> => {
      if (!projectId) return fetch(url, options);
      const sep = url.includes("?") ? "&" : "?";
      return fetch(`${url}${sep}project_id=${projectId}`, options);
    },
    [projectId]
  );

  // Extract papers from a message (arXiv links + optional markdown titles)
  function extractPapersFromText(text: string): Array<{ id: string; title: string; url: string }> {
    const papers: Array<{ id: string; title: string; url: string }> = [];
    const seenIds = new Set<string>();

    // 1. **Title** ([arXiv:ID](url)) or **Title** ([ID](url))
    const titleLinkRegex = /\*\*([^*]+)\*\*\s*\(\[(?:arXiv:)?([0-9.]+)\]\((https?:\/\/arxiv\.org\/abs\/[0-9.]+)\)\)/gi;
    let m;
    while ((m = titleLinkRegex.exec(text)) !== null) {
      if (!seenIds.has(m[2])) {
        seenIds.add(m[2]);
        papers.push({ id: m[2], title: m[1].trim(), url: m[3] });
      }
    }

    // 2. [Title](https://arxiv.org/abs/ID)
    const linkTitleRegex = /\[([^\]]+)\]\((https?:\/\/arxiv\.org\/abs\/([0-9.]+))\)/gi;
    while ((m = linkTitleRegex.exec(text)) !== null) {
      if (!seenIds.has(m[3])) {
        seenIds.add(m[3]);
        papers.push({ id: m[3], title: m[1].trim(), url: m[2] });
      }
    }

    // 3. Bare arxiv URLs
    const bareArxiv = text.match(/https?:\/\/arxiv\.org\/abs\/([0-9.]+)/g) || [];
    bareArxiv.forEach((link) => {
      const idMatch = link.match(/([0-9.]+)$/);
      if (idMatch && !seenIds.has(idMatch[1])) {
        seenIds.add(idMatch[1]);
        papers.push({ id: idMatch[1], title: "", url: link });
      }
    });

    // 4. Standalone arXiv IDs (e.g. 2401.12345 or arXiv:2401.12345) so we show the button even when the agent doesn't use markdown links
    const idRegex = /\b(?:arXiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)\b/gi;
    while ((m = idRegex.exec(text)) !== null) {
      const id = m[1];
      if (!seenIds.has(id)) {
        seenIds.add(id);
        papers.push({
          id,
          title: "",
          url: `https://arxiv.org/abs/${id}`,
        });
      }
    }

    return papers;
  }

  /** Remove arXiv IDs from agent response so they are not shown in the chat. */
  function stripArxivIdsFromResponse(text: string): string {
    if (!text || typeof text !== "string") return text;
    return text
      .replace(/\barXiv:\s*[0-9]+\.[0-9]+(?:v[0-9]+)?\b/gi, "")
      .replace(/\s*\([0-9]+\.[0-9]+(?:v[0-9]+)?\)/g, "")
      .replace(/\s*\[(?:arXiv:)?[0-9]+\.[0-9]+(?:v[0-9]+)?\]\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function saveMessageToLibrary(text: string) {
    const newPapers = extractPapersFromText(text);
    if (newPapers.length === 0) return;
    (async () => {
      try {
        await apiFetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ papers: newPapers }),
        });
        await fetchLibrary();
      } catch {
        // fallback: local state only
        setLibraryPapers(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const uniqueNew = newPapers.filter(p => !existingIds.has(p.id));
          return [...prev, ...uniqueNew];
        });
      }
    })();
  }

  function toggleChatPaperSelection(msgIndex: number, arxivId: string) {
    setChatPaperSelections((prev) => {
      const current = new Set(prev[msgIndex] ?? []);
      if (current.has(arxivId)) {
        current.delete(arxivId);
      } else {
        current.add(arxivId);
      }
      return { ...prev, [msgIndex]: current };
    });
  }

  function selectAllChatPapers(msgIndex: number, papers: ChatPaper[]) {
    setChatPaperSelections((prev) => ({
      ...prev,
      [msgIndex]: new Set(papers.map((p) => p.arxiv_id)),
    }));
  }

  function deselectAllChatPapers(msgIndex: number) {
    setChatPaperSelections((prev) => ({
      ...prev,
      [msgIndex]: new Set<string>(),
    }));
  }

  async function saveSelectedChatPapers(msgIndex: number, papers: ChatPaper[]) {
    const selected = chatPaperSelections[msgIndex];
    if (!selected || selected.size === 0) return;
    const toSave = papers
      .filter((p) => selected.has(p.arxiv_id))
      .map((p) => ({
        id: p.arxiv_id,
        title: p.title,
        url: p.url,
        authors: p.authors,
        abstract: p.abstract,
      }));
    if (toSave.length === 0) return;
    try {
      await apiFetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papers: toSave }),
      });
      setSavedToLibraryMessageIndices((s) => new Set(s).add(msgIndex));
      await fetchLibrary();
    } catch {
      // silent fail
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchLibrary() {
    try {
      const res = await apiFetch("/api/library");
      const data = await res.json();
      if (Array.isArray(data.papers)) setLibraryPapers(data.papers);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (scopeDefined) fetchLibrary();
  }, [scopeDefined]);

  // Refetch library when switching to Library tab so we get updated abstracts/PDF links
  useEffect(() => {
    if (scopeDefined && activeTab === "library") fetchLibrary();
  }, [scopeDefined, activeTab]);

  async function fetchNotes() {
    try {
      const res = await apiFetch("/api/notes");
      const data = await res.json();
      if (Array.isArray(data.notes)) setNotes(data.notes);
    } catch {
      // ignore
    }
  }

  // Extract GitHub links from library papers' stored links and abstracts
  function extractCodeLinksFromLibrary() {
    const ghRegex = /https?:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/g;
    const links: Array<{ paperId: string; paperTitle: string; url: string; repoName: string }> = [];
    const seen = new Set<string>();

    function addLink(paper: typeof libraryPapers[0], url: string) {
      const clean = url.replace(/[.,;)}\]]+$/, "");
      if (seen.has(clean)) return;
      seen.add(clean);
      try {
        const parts = new URL(clean).pathname.split("/").filter(Boolean);
        const repoName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : clean;
        links.push({ paperId: paper.id, paperTitle: paper.title, url: clean, repoName });
      } catch {
        // invalid URL, skip
      }
    }

    for (const paper of libraryPapers) {
      // First: stored GitHub links from full-text extraction
      if (paper.githubLinks) {
        for (const link of paper.githubLinks) addLink(paper, link);
      }
      // Second: scan the abstract for any additional GitHub links
      const text = [paper.abstract ?? "", paper.url ?? ""].join(" ");
      const matches = text.match(ghRegex) || [];
      for (const m of matches) addLink(paper, m);
    }
    setCodeLinks(links);
  }

  async function handleDeployDemo(repoUrl: string) {
    if (deployStatus[repoUrl]?.loading) return;
    setDeployStatus(prev => ({ ...prev, [repoUrl]: { loading: true, statusMessage: "Starting..." } }));
    setExpandedDeploy(repoUrl);
    setShowEnvForm(null);

    // Parse env vars from the textarea (KEY=VALUE per line)
    const envText = envVarsInput[repoUrl] || "";
    const envVars: Record<string, string> = {};
    for (const line of envText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        envVars[key] = val;
      }
    }

    try {
      const reqBody: Record<string, unknown> = { repo_url: repoUrl, project_id: projectId };
      if (Object.keys(envVars).length > 0) reqBody.env_vars = envVars;

      const res = await fetch("/api/deploy-demo?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      if (!res.ok) {
        const data = await res.json();
        setDeployStatus(prev => ({ ...prev, [repoUrl]: { loading: false, error: data.error || "Deploy failed" } }));
        return;
      }

      // Read SSE stream for live progress
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events (separated by double newlines)
        const parts = buffer.split("\n\n");
        buffer = parts.pop()!; // keep incomplete last chunk

        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split("\n");
          let eventType = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            if (line.startsWith("data: ")) data = line.slice(6);
          }

          if (eventType === "status" && data) {
            try {
              const parsed = JSON.parse(data);
              setDeployStatus(prev => ({
                ...prev,
                [repoUrl]: { ...prev[repoUrl], loading: true, statusMessage: parsed.message },
              }));
            } catch { /* ignore */ }
          } else if (eventType === "step" && data) {
            try {
              const step = JSON.parse(data);
              setDeployStatus(prev => {
                const existing = prev[repoUrl];
                const existingSteps = existing?.result?.steps || [];
                return {
                  ...prev,
                  [repoUrl]: {
                    ...existing,
                    loading: true,
                    statusMessage: `Step ${step.step}: $ ${step.command.slice(0, 60)}`,
                    result: {
                      ...existing?.result,
                      status: "running",
                      summary: "",
                      steps: [...existingSteps, step],
                    },
                  },
                };
              });
            } catch { /* ignore */ }
          } else if (eventType === "complete" && data) {
            try {
              const result = JSON.parse(data);
              setDeployStatus(prev => ({
                ...prev,
                [repoUrl]: { loading: false, result },
              }));
            } catch { /* ignore */ }
          }
        }
      }

      // If stream ended without a complete event, mark as done
      setDeployStatus(prev => {
        if (prev[repoUrl]?.loading) {
          return { ...prev, [repoUrl]: { ...prev[repoUrl], loading: false } };
        }
        return prev;
      });
    } catch (err) {
      setDeployStatus(prev => ({ ...prev, [repoUrl]: { loading: false, error: (err as Error).message } }));
    }
  }

  useEffect(() => {
    if (scopeDefined && (activeTab === "notes" || activeTab === "library")) fetchNotes();
  }, [scopeDefined, activeTab]);

  useEffect(() => {
    if (scopeDefined && activeTab === "code") extractCodeLinksFromLibrary();
  }, [scopeDefined, activeTab, libraryPapers]);

  async function handleScopeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const description = scopeInput.trim();
    if (!description || creatingProject) return;

    setCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (data.project) {
        setProjectId(data.project.id);
        setProjectName(data.project.name);
    setScopeDefined(true);
    setMessages([
      {
        role: "system",
            text: `Project "${data.project.name}" created.\n\nYou can now ask questions about trends, compare approaches, find related papers, or explore this research area.`,
      },
    ]);
      } else {
        setMessages([{ role: "error", text: data.error || "Failed to create project" }]);
      }
    } catch (err) {
      setMessages([{ role: "error", text: "Failed to create project: " + (err instanceof Error ? err.message : String(err)) }]);
    } finally {
      setCreatingProject(false);
    }
  }

  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    setLoadingStage("Connecting to agent...");

    try {
      // Simulate stage progression
      setTimeout(() => setLoadingStage("Searching papers..."), 500);
      setTimeout(() => setLoadingStage("Analyzing results..."), 2000);
      setTimeout(() => setLoadingStage("Generating response..."), 4000);

      const selectedIds = selectedLibraryIds.size > 0 ? [...selectedLibraryIds] : undefined;
      // Send conversation history so the agent has multi-turn context
      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: text,
          scope: scopeInput,
          project_id: projectId,
          selected_paper_ids: selectedIds,
          history,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages((m) => [
          ...m,
          { role: "error", text: data.error + (data.detail ? "\n" + data.detail.slice(0, 150) : "") },
        ]);
      } else {
        // Ensure response is a string
        const rawResponse = typeof data.response === 'string' 
          ? data.response 
          : typeof data.response === 'object' 
            ? JSON.stringify(data.response, null, 2)
            : String(data.response || "");
        const responseText = stripArxivIdsFromResponse(rawResponse);
        // Attach structured papers from the API for interactive selection
        const returnedPapers: ChatPaper[] = Array.isArray(data.papers) ? data.papers : [];
        setMessages((m) => [...m, { role: "assistant", text: responseText, papers: returnedPapers }]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "error", text: "Request failed: " + (err instanceof Error ? err.message : String(err)) },
      ]);
    } finally {
      setLoading(false);
      setLoadingStage("");
    }
  }

  if (!scopeDefined) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
        {/* Figma gradient background */}
        <div 
          className="absolute inset-0" 
          style={{
            background: 'linear-gradient(180deg, #E7ECF6 33%, #FFE073 67%, #D34EA1 100%)'
          }}
        ></div>
        
        {/* Noise overlay image from Figma */}
        <div 
          className="absolute left-0 top-0 h-full w-full"
          style={{
            backgroundImage: 'url(/gradient.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        ></div>

        {/* Large white layer - contains all content */}
        <div
          className="absolute flex flex-col items-center justify-center overflow-hidden"
          style={{
            left: 'calc(3.7vw)',
            top: 'calc(5.7vh)',
            right: 'calc(3.7vw)',
            bottom: 'calc(5.7vh)',
            background: '#FFFFFF',
            borderRadius: '40px',
          }}
        >
          {/* Falling emoji animation */}
          <style>{`
            @keyframes fall {
              0% { transform: translateY(-120px) rotate(0deg); opacity: 0; }
              3% { opacity: 0; }
              6% { opacity: 0.7; }
              85% { opacity: 0.7; }
              100% { transform: translateY(calc(90vh)) rotate(20deg); opacity: 0; }
            }
          `}</style>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
            <span style={{ position: 'absolute', top: '-120px', left: '3%', fontSize: '20px', opacity: 0, animation: 'fall 12s linear infinite', animationDelay: '0s', animationFillMode: 'backwards' }}>🤖</span>
            <span style={{ position: 'absolute', top: '-120px', left: '8%', fontSize: '22px', opacity: 0, animation: 'fall 14s linear infinite', animationDelay: '1.5s', animationFillMode: 'backwards' }}>🚀</span>
            <span style={{ position: 'absolute', top: '-120px', left: '14%', fontSize: '18px', opacity: 0, animation: 'fall 11s linear infinite', animationDelay: '4s', animationFillMode: 'backwards' }}>🧫</span>
            <span style={{ position: 'absolute', top: '-120px', left: '18%', fontSize: '16px', opacity: 0, animation: 'fall 13s linear infinite', animationDelay: '2s', animationFillMode: 'backwards' }}>🧪</span>
            <span style={{ position: 'absolute', top: '-120px', left: '82%', fontSize: '20px', opacity: 0, animation: 'fall 15s linear infinite', animationDelay: '0.5s', animationFillMode: 'backwards' }}>🧬</span>
            <span style={{ position: 'absolute', top: '-120px', left: '86%', fontSize: '24px', opacity: 0, animation: 'fall 10s linear infinite', animationDelay: '3s', animationFillMode: 'backwards' }}>🔬</span>
            <span style={{ position: 'absolute', top: '-120px', left: '90%', fontSize: '18px', opacity: 0, animation: 'fall 12s linear infinite', animationDelay: '1s', animationFillMode: 'backwards' }}>🔭</span>
            <span style={{ position: 'absolute', top: '-120px', left: '94%', fontSize: '22px', opacity: 0, animation: 'fall 14s linear infinite', animationDelay: '3.5s', animationFillMode: 'backwards' }}>📡</span>
            <span style={{ position: 'absolute', top: '-120px', left: '6%', fontSize: '16px', opacity: 0, animation: 'fall 11s linear infinite', animationDelay: '2.5s', animationFillMode: 'backwards' }}>🗺</span>
            <span style={{ position: 'absolute', top: '-120px', left: '92%', fontSize: '20px', opacity: 0, animation: 'fall 13s linear infinite', animationDelay: '0.8s', animationFillMode: 'backwards' }}>🌁</span>
            <span style={{ position: 'absolute', top: '-120px', left: '10%', fontSize: '18px', opacity: 0, animation: 'fall 15s linear infinite', animationDelay: '5s', animationFillMode: 'backwards' }}>🔋</span>
            <span style={{ position: 'absolute', top: '-120px', left: '88%', fontSize: '16px', opacity: 0, animation: 'fall 12s linear infinite', animationDelay: '6s', animationFillMode: 'backwards' }}>💡</span>
            <span style={{ position: 'absolute', top: '-120px', left: '5%', fontSize: '20px', opacity: 0, animation: 'fall 14s linear infinite', animationDelay: '7s', animationFillMode: 'backwards' }}>🎞</span>
            <span style={{ position: 'absolute', top: '-120px', left: '95%', fontSize: '18px', opacity: 0, animation: 'fall 11s linear infinite', animationDelay: '4.5s', animationFillMode: 'backwards' }}>🦠</span>
            <span style={{ position: 'absolute', top: '-120px', left: '16%', fontSize: '22px', opacity: 0, animation: 'fall 13s linear infinite', animationDelay: '8s', animationFillMode: 'backwards' }}>📜</span>
            <span style={{ position: 'absolute', top: '-120px', left: '84%', fontSize: '16px', opacity: 0, animation: 'fall 10s linear infinite', animationDelay: '5.5s', animationFillMode: 'backwards' }}>📊</span>
            <span style={{ position: 'absolute', top: '-120px', left: '12%', fontSize: '20px', opacity: 0, animation: 'fall 15s linear infinite', animationDelay: '9s', animationFillMode: 'backwards' }}>💻</span>
          </div>
          <div className="w-full max-w-3xl px-8">
            {/* Logo & Title */}
            <div className="mb-4 text-center">
              <h1 className="flex items-start justify-center gap-3" style={{ fontFamily: 'Lato', fontStyle: 'italic', fontWeight: 900, fontSize: '45px', lineHeight: '54px', textAlign: 'center', color: '#AF247B' }}>
                <span style={{ position: 'relative', display: 'inline-block', background: 'linear-gradient(to top, #FFD84E 0%, #FFD84E 25%, transparent 25%, transparent 100%)', fontWeight: 300 }}>
                  research
                </span>
                <img 
                  src="/logo.png" 
                  alt="logo" 
                  style={{ height: '90px', width: 'auto', objectFit: 'contain', imageRendering: 'crisp-edges' }}
                />
                <span style={{ position: 'relative', display: 'inline-block', background: 'linear-gradient(to top, #FFD84E 0%, #FFD84E 25%, transparent 25%, transparent 100%)', fontWeight: 300 }}>
                  atelier
                </span>
              </h1>
              <p style={{ fontFamily: 'Lato', fontSize: '16px', fontWeight: 400, color: '#231F1F', marginTop: '-22px', letterSpacing: '0.02em', position: 'relative', zIndex: 1 }}>
                Research tailored to you.
              </p>
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', position: 'relative', zIndex: 1 }}>
                <div style={{ width: '220px', height: '2px', background: '#AF247B' }} />
                <div style={{ width: '220px', height: '2px', background: '#AF247B' }} />
              </div>
              <p style={{ fontFamily: 'Lato', fontSize: '14px', fontWeight: 400, color: '#231F1F', marginTop: '16px', lineHeight: '1.6', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto' }}>
                Create a project to explore a topic with an AI research workspace — discover papers, ask questions, and organize what you learn in one place.
              </p>
            </div>

            {/* Search-style input */}
            <form onSubmit={handleScopeSubmit}>
              <div className="mb-8 rounded-3xl border-2 border-blue-500 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <svg className="h-6 w-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={scopeInput}
                    onChange={(e) => setScopeInput(e.target.value)}
                    placeholder='e.g. "efficient LLM inference on smartNICs"'
                    className="flex-1 text-lg text-zinc-700 placeholder-zinc-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={creatingProject}
                    className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
                  >
                    {creatingProject ? (
                      <span className="text-sm text-zinc-500">Creating...</span>
                    ) : (
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    )}
                  </button>
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-full border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm hover:bg-zinc-100"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    arXiv
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-full border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm hover:bg-zinc-100"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Semantic Search
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>

            {/* Drop zone */}
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 py-4">
              <div className="text-center">
                <p className="mb-0.5 text-xs text-zinc-500">or drop your research notes and relevant publications</p>
                <p className="mb-3 text-[10px] text-zinc-400">
                  pdf, images, docs
                </p>

                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-medium transition-all hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload files
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-medium transition-all hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Websites
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-medium transition-all hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    Drive
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-medium transition-all hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Copied text
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden">
      {/* Figma gradient background */}
      <div 
        className="absolute inset-0" 
        style={{
          background: 'linear-gradient(180deg, #E7ECF6 33%, #FFE073 67%, #D34EA1 100%)'
        }}
      ></div>
      
      {/* Noise overlay image */}
      <div 
        className="absolute left-0 top-0 h-full w-full"
        style={{
          backgroundImage: 'url(/gradient.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      ></div>

      {/* White overlay container - contains everything */}
      <div
        className="absolute flex flex-col"
        style={{
          left: 'calc(3.7vw)',
          top: 'calc(5.7vh)',
          right: 'calc(3.7vw)',
          bottom: 'calc(5.7vh)',
          background: '#FFFFFF',
          borderRadius: '40px',
        }}
      >
        {/* Header inside white container */}
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left side - Logo and Title */}
          <div className="flex items-start gap-3">
            <img 
              src="/logo.png" 
              alt="logo" 
              style={{ height: '88px', width: 'auto', objectFit: 'contain' }}
            />
            <div style={{ marginTop: '8px' }}>
              <h1 style={{ fontFamily: 'Lato', fontStyle: 'italic', fontWeight: 900, fontSize: '26px', color: '#AF247B' }}>
                <span style={{ position: 'relative', display: 'inline-block', background: 'linear-gradient(to top, #FFD84E 0%, #FFD84E 25%, transparent 25%, transparent 100%)' }}>
                  research
                </span>
                {' '}
                <span style={{ position: 'relative', display: 'inline-block', background: 'linear-gradient(to top, #FFD84E 0%, #FFD84E 25%, transparent 25%, transparent 100%)' }}>
                  atelier
                </span>
              </h1>
            </div>
          </div>

          {/* Right side - Scope tag and button */}
          <div className="flex items-center gap-3" style={{ marginTop: '-20px', marginRight: '20px' }}>
            {/* Scope tag */}
            <div
              className="flex items-center gap-2 px-5 py-2"
              style={{
                background: 'rgba(196, 210, 237, 0.3)',
                border: '1px solid #E5E5E5',
                borderRadius: '40px',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#AF247B',
                }}
              ></div>
              <span style={{
                fontFamily: 'Lato',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '18px',
                lineHeight: '22px',
                textAlign: 'center',
                color: '#231F1F',
              }}>{projectName || scopeInput}</span>
            </div>
            
            <Link
              href={`/discovery${projectId ? `?project=${projectId}&name=${encodeURIComponent(projectName || scopeInput)}` : ''}`}
              className="rounded-lg bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              style={{ border: '1px solid #E5E5E5' }}
            >
              Discovery
            </Link>
            <Link
              href="/projects"
              className="rounded-lg bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              style={{ border: '1px solid #E5E5E5' }}
            >
              Projects
            </Link>
          </div>
        </div>

        {/* Messages Area - split into two halves */}
        <div className="flex flex-1 gap-6 overflow-hidden px-8 pb-6" style={{ marginTop: '-40px' }}>
          {/* Left half - Library/Notes tabs */}
          <div className="flex flex-1 flex-col">
            {/* Tabs - browser style with close buttons */}
            <div className="flex gap-0 border-b border-pink-600" style={{ marginBottom: '-1px' }}>
              <button
                onClick={() => setActiveTab("library")}
                className="flex items-center gap-2 border border-b-0 border-pink-600 px-4 py-1.5 text-sm"
                style={{
                  background: activeTab === "library" ? "rgba(196, 210, 237, 0.3)" : "transparent",
                }}
              >
                <span>Library</span>
                <span className="text-xs" style={{ color: '#AF247B' }}>x</span>
              </button>
              <button
                onClick={() => setActiveTab("notes")}
                className="flex items-center gap-2 border border-b-0 border-l-0 border-pink-600 px-4 py-1.5 text-sm"
                style={{
                  background: activeTab === "notes" ? "rgba(196, 210, 237, 0.3)" : "transparent",
                }}
              >
                <span>Notes</span>
                <span className="text-xs" style={{ color: '#AF247B' }}>x</span>
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className="flex items-center gap-2 border border-b-0 border-l-0 border-pink-600 px-4 py-1.5 text-sm"
                style={{
                  background: activeTab === "code" ? "rgba(196, 210, 237, 0.3)" : "transparent",
                }}
              >
                <span>Code</span>
                <span className="text-xs" style={{ color: '#AF247B' }}>x</span>
              </button>
            </div>
            
            {/* Tab content with border */}
            <div className="flex-1 overflow-y-auto border border-pink-600 p-4">
              {activeTab === "library" && (
                <div className="space-y-3">
                  {libraryPapers.length === 0 ? (
                    <p className="text-sm text-zinc-500">No papers yet. Ask the AI to find papers on your topic.</p>
                  ) : (
                    <>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-800">
                        <input
                          type="checkbox"
                          checked={selectedLibraryIds.size === libraryPapers.length && libraryPapers.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLibraryIds(new Set(libraryPapers.map((p) => p.id)));
                            } else {
                              setSelectedLibraryIds(new Set());
                            }
                          }}
                          className="h-4 w-4 rounded border-zinc-300 text-pink-600 focus:ring-pink-500"
                        />
                        <span>Select all ({libraryPapers.length})</span>
                      </label>
                      {selectedLibraryIds.size > 0 && (
                        <p className="text-xs text-zinc-500">
                          {selectedLibraryIds.size} selected — next AI chat will focus on these papers.
                        </p>
                      )}
                      {libraryPapers.map((paper) => {
                      const authors = paper.authors ?? [];
                      const showExpand = authors.length > 3;
                      const expanded = authorsExpanded.has(paper.id);
                      const displayAuthors = expanded ? authors : authors.slice(0, 3);
                      const addedDate = paper.addedAt
                        ? new Date(paper.addedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : null;
                      const displayTitle =
                        paper.title && !/^arXiv:\d+\.\d+/i.test(paper.title)
                          ? paper.title
                          : `Untitled (${paper.id})`;
                      const publishedLabel = paper.publishedDate
                        ? new Date(paper.publishedDate + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : paper.publishedYear
                          ? paper.publishedYear
                          : null;
                      const isSelected = selectedLibraryIds.has(paper.id);
                      return (
                        <div
                          key={paper.id}
                          className={`rounded-lg border p-3 ${isSelected ? "border-amber-200 hover:border-amber-300" : "border-zinc-200 bg-white hover:border-pink-300 hover:bg-pink-50"}`}
                          style={isSelected ? { background: "#FFFBEC" } : undefined}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedLibraryIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(paper.id)) next.delete(paper.id);
                                    else next.add(paper.id);
                                    return next;
                                  });
                                }}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-pink-600 focus:ring-pink-500"
                              />
                              <div className="min-w-0 flex-1">
                              <a
                                href={paper.url ?? `https://arxiv.org/abs/${paper.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 hover:text-pink-600"
                              >
                                <span className="shrink-0 text-zinc-400" aria-hidden>
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M7 2h3v3" />
                                    <path d="M11 1L5.5 6.5" />
                                    <path d="M11 6v4a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1h4" />
                                  </svg>
                                </span>
                                {displayTitle}
                              </a>
                              {displayAuthors.length > 0 && (
                                <p className="mt-1 text-xs text-zinc-600">
                                  {displayAuthors.join(", ")}
                                  {showExpand && (
                                    <>
                                      {!expanded && "..."}
                                      <button
                                        type="button"
                                        onClick={() => setAuthorsExpanded((s) => {
                                          const next = new Set(s);
                                          if (next.has(paper.id)) next.delete(paper.id);
                                          else next.add(paper.id);
                                          return next;
                                        })}
                                        className="ml-1 text-pink-600 hover:underline"
                                      >
                                        {expanded ? "collapse" : "expand"}
                                      </button>
                                    </>
                                  )}
                                </p>
                              )}
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-xs text-zinc-500">
                                {publishedLabel && (
                                  <span>Date published: {publishedLabel}</span>
                                )}
                                {addedDate && (
                                  <span>Date added to the library: {addedDate}</span>
                                )}
                              </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiFetch("/api/library/approve", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ paper_id: paper.id, approved: true }),
                                    });
                                    await fetchLibrary();
                                  } catch {
                                    // ignore
                                  }
                                }}
                                title="Approve"
                                className={`rounded p-1 ${paper.approved ? "text-green-600" : "text-zinc-400 hover:text-green-600"}`}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiFetch("/api/library/remove", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ paper_ids: [paper.id] }),
                                    });
                                    await fetchLibrary();
                                  } catch {
                                    // ignore
                                  }
                                }}
                                title="Remove from library"
                                className="rounded p-1 text-zinc-400 hover:text-red-600"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                  <line x1="10" y1="11" x2="10" y2="17" />
                                  <line x1="14" y1="11" x2="14" y2="17" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          {paper.abstract && (
                            <div className="mt-2 flex flex-wrap items-baseline gap-x-1">
                              <div
                                className="min-w-0 flex-1 text-xs text-zinc-600"
                                title={abstractExpanded.has(paper.id) ? undefined : paper.abstract}
                                style={
                                  abstractExpanded.has(paper.id)
                                    ? undefined
                                    : {
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                      }
                                }
                              >
                                {paper.abstract}
                              </div>
                              <button
                                type="button"
                                onClick={() => setAbstractExpanded((s) => {
                                  const next = new Set(s);
                                  if (next.has(paper.id)) next.delete(paper.id);
                                  else next.add(paper.id);
                                  return next;
                                })}
                                className="shrink-0 text-xs text-pink-600 hover:underline"
                              >
                                {abstractExpanded.has(paper.id) ? "collapse" : "expand"}
                              </button>
                            </div>
                          )}
                          {/* Notes for this paper - toggles (Notion-style: pink pill, normal text) */}
                          <div className="mt-3">
                            {(() => {
                              const paperNotes = notes.filter((n) => n.paperId === paper.id);
                              const hasNotes = paperNotes.length > 0;
                              const showNotes = showNotesForPaper.has(paper.id);
                              const addOpen = addNoteOpenForPaper.has(paper.id);
                              return (
                                <div className="space-y-2">
                                  {hasNotes && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setShowNotesForPaper((s) => {
                                          const next = new Set(s);
                                          if (next.has(paper.id)) next.delete(paper.id);
                                          else next.add(paper.id);
                                          return next;
                                        })}
                                        className="flex items-center gap-1.5 text-left text-xs text-zinc-800 hover:opacity-80"
                                      >
                                        <span
                                          className="flex shrink-0 text-pink-600 transition-transform"
                                          style={{ transform: showNotes ? "rotate(90deg)" : "none" }}
                                          aria-hidden
                                        >
                                          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="block">
                                            <path d="M2 1v8l6-4-6-4z" />
                                          </svg>
                                        </span>
                                        <span>{showNotes ? "Hide notes" : `Show notes (${paperNotes.length})`}</span>
                                      </button>
                                      {showNotes && (
                                        <div className="space-y-2 pl-4">
                                          {paperNotes.map((n) => (
                                            <div key={n.id} className="flex items-start justify-between gap-2 text-xs">
                                              <div className="min-w-0 flex-1 prose prose-xs max-w-none text-zinc-600 dark:text-zinc-400 dark:prose-invert">
                                                <ReactMarkdown
                                                  components={{
                                                    a: ({ node, ...props }) => <a {...props} className="text-pink-600 hover:underline" target="_blank" rel="noopener noreferrer" />,
                                                    p: ({ node, ...props }) => <p {...props} className="text-xs leading-relaxed mb-1" />,
                                                    code: ({ node, ...props }) => <code {...props} className="rounded bg-zinc-100 px-1 py-0.5 text-[10px] dark:bg-zinc-800" />,
                                                  }}
                                                >
                                                  {n.content}
                                                </ReactMarkdown>
                                              </div>
                                              <span className="shrink-0 text-zinc-400">
                                                {new Date(n.updatedAt).toLocaleDateString("en-GB", {
                                                  day: "numeric",
                                                  month: "short",
                                                  year: "numeric",
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                                })}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setAddNoteOpenForPaper((s) => {
                                      const next = new Set(s);
                                      if (next.has(paper.id)) next.delete(paper.id);
                                      else next.add(paper.id);
                                      return next;
                                    })}
                                    className="flex items-center gap-1.5 text-left text-xs text-zinc-800 hover:opacity-80"
                                  >
                                    <span
                                      className="flex shrink-0 text-pink-600 transition-transform"
                                      style={{ transform: addOpen ? "rotate(90deg)" : "none" }}
                                      aria-hidden
                                    >
                                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="block">
                                        <path d="M2 1v8l6-4-6-4z" />
                                      </svg>
                                    </span>
                                    <span>{addOpen ? "Cancel" : "Add a note"}</span>
                                  </button>
                                  {addOpen && (
                                    <div className="flex gap-2">
                                      <textarea
                                        value={paperNoteDrafts[paper.id] ?? ""}
                                        onChange={(e) => setPaperNoteDrafts((d) => ({ ...d, [paper.id]: e.target.value }))}
                                        placeholder="Add a note for this paper..."
                                        rows={2}
                                        className="min-w-0 flex-1 rounded border border-zinc-200 p-2 text-xs placeholder:text-zinc-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                                      />
                                      <button
                                        type="button"
                                        disabled={!(paperNoteDrafts[paper.id] ?? "").trim()}
                                        onClick={async () => {
                                          const content = (paperNoteDrafts[paper.id] ?? "").trim();
                                          if (!content) return;
                                          try {
                                            await apiFetch("/api/notes", {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ content, paper_id: paper.id }),
                                            });
                                            setPaperNoteDrafts((d) => ({ ...d, [paper.id]: "" }));
                                            setAddNoteOpenForPaper((s) => { const n = new Set(s); n.delete(paper.id); return n; });
                                            await fetchNotes();
                                          } catch {
                                            // ignore
                                          }
                                        }}
                                        className="shrink-0 self-end rounded bg-pink-600 px-2 py-1.5 text-xs text-white hover:bg-pink-700 disabled:opacity-50"
                                      >
                                        Add note
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                    </>
                  )}
                </div>
              )}
              
              {activeTab === "notes" && (
                <div className="flex flex-col gap-6 font-sans">
                  {/* New general note - Notion-style top block */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const content = newNoteContent.trim();
                      if (!content) return;
                      try {
                        await apiFetch("/api/notes", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ content }),
                        });
                        setNewNoteContent("");
                        await fetchNotes();
                      } catch {
                        // ignore
                      }
                    }}
                    className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                  >
                    <textarea
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      placeholder="New note…"
                      rows={2}
                      className="w-full resize-none border-0 p-0 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-0"
                    />
                    <button
                      type="submit"
                      disabled={!newNoteContent.trim()}
                      className="mt-2 text-xs font-medium text-pink-600 hover:underline disabled:opacity-50"
                    >
                      Add note
                    </button>
                  </form>

                  {/* Notes grouped by paper (bundles) + General */}
                  {(() => {
                    const general = notes.filter((n) => !n.paperId);
                    const byPaper = new Map<string | null, typeof notes>();
                    byPaper.set(null, general);
                    for (const note of notes) {
                      if (note.paperId) {
                        if (!byPaper.has(note.paperId)) byPaper.set(note.paperId, []);
                        byPaper.get(note.paperId)!.push(note);
                      }
                    }
                    const paperIds = [...byPaper.keys()].filter((id): id is string => id !== null);
                    paperIds.sort((a, b) => {
                      const aMax = Math.max(...(byPaper.get(a) ?? []).map((n) => new Date(n.updatedAt).getTime()));
                      const bMax = Math.max(...(byPaper.get(b) ?? []).map((n) => new Date(n.updatedAt).getTime()));
                      return bMax - aMax;
                    });
                    const sections: { label: string; paperId: string | null; items: typeof notes }[] = [];
                    if (general.length > 0) sections.push({ label: "General", paperId: null, items: general });
                    for (const pid of paperIds) {
                      const items = byPaper.get(pid) ?? [];
                      const title = libraryPapers.find((p) => p.id === pid)?.title ?? "Untitled";
                      sections.push({ label: title, paperId: pid, items });
                    }
                    if (sections.length === 0) return <p className="text-sm text-zinc-500">No notes yet.</p>;
                    return (
                      <div className="space-y-8">
                        {sections.map(({ label, paperId, items }) => (
                          <section key={paperId ?? "general"}>
                            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                              {label}
                            </h3>
                            <div className="space-y-4">
                              {items.map((note) => (
                                <div
                                  key={note.id}
                                  className="rounded-lg border border-zinc-100 bg-white py-3 px-4 text-sm text-zinc-800"
                                >
                                  {editingNoteId === note.id ? (
                                    <div className="space-y-2">
                                      <textarea
                                        value={editingNoteContent}
                                        onChange={(e) => setEditingNoteContent(e.target.value)}
                                        rows={4}
                                        className="w-full resize-none border-0 p-0 text-sm focus:outline-none focus:ring-0"
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            try {
                                              await fetch(`/api/notes/${note.id}`, {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ content: editingNoteContent }),
                                              });
                                              setEditingNoteId(null);
                                              setEditingNoteContent("");
                                              await fetchNotes();
                                            } catch {
                                              // ignore
                                            }
                                          }}
                                          className="text-xs font-medium text-pink-600 hover:underline"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingNoteId(null);
                                            setEditingNoteContent("");
                                          }}
                                          className="text-xs text-zinc-500 hover:underline"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="prose prose-sm max-w-none text-zinc-900 dark:text-zinc-100 dark:prose-invert">
                                        <ReactMarkdown
                                          components={{
                                            a: ({ node, ...props }) => (
                                              <a {...props} className="text-pink-600 hover:underline dark:text-pink-400" target="_blank" rel="noopener noreferrer" />
                                            ),
                                            h2: ({ node, ...props }) => <h2 {...props} className="mt-3 mb-1.5 text-sm font-semibold" />,
                                            h3: ({ node, ...props }) => <h3 {...props} className="mt-2 mb-1 text-sm font-medium" />,
                                            p: ({ node, ...props }) => <p {...props} className="text-sm leading-relaxed mb-2" />,
                                            ul: ({ node, ...props }) => <ul {...props} className="space-y-1 my-1.5 list-disc pl-4" />,
                                            ol: ({ node, ...props }) => <ol {...props} className="space-y-1 my-1.5 list-decimal pl-4" />,
                                            li: ({ node, ...props }) => <li {...props} className="text-sm" />,
                                            code: ({ node, ...props }) => <code {...props} className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800" />,
                                            pre: ({ node, ...props }) => <pre {...props} className="rounded-lg bg-zinc-100 p-3 text-xs overflow-x-auto dark:bg-zinc-800" />,
                                          }}
                                        >
                                          {note.content}
                                        </ReactMarkdown>
                                      </div>
                                      <div className="mt-2 flex items-center justify-between gap-2">
                                        <span className="text-xs text-zinc-400">
                                          {new Date(note.updatedAt).toLocaleDateString("en-GB", {
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                        <div className="flex gap-3">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingNoteId(note.id);
                                              setEditingNoteContent(note.content);
                                            }}
                                            className="text-xs text-pink-600 hover:underline"
                                          >
                                            Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              try {
                                                await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
                                                await fetchNotes();
                                              } catch {
                                                // ignore
                                              }
                                            }}
                                            className="text-xs text-zinc-500 hover:underline"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {activeTab === "code" && (
                <div className="flex flex-col gap-4 font-sans">
                  {codeLinks.length === 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm text-zinc-500">
                        No GitHub repositories found in your library papers yet.
                      </p>
                      <p className="text-xs text-zinc-400">
                        Code links are extracted from paper full-text and abstracts. Add papers to your library and their GitHub repos will appear here automatically once indexing completes.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-zinc-500">
                        {codeLinks.length} repositor{codeLinks.length === 1 ? "y" : "ies"} found in library papers
                      </p>
                      {/* Group by paper */}
                      {(() => {
                        const byPaper = new Map<string, { title: string; links: typeof codeLinks }>();
                        for (const link of codeLinks) {
                          if (!byPaper.has(link.paperId)) {
                            byPaper.set(link.paperId, { title: link.paperTitle, links: [] });
                          }
                          byPaper.get(link.paperId)!.links.push(link);
                        }
                        return [...byPaper.entries()].map(([paperId, { title, links }]) => (
                          <section key={paperId} className="space-y-2">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 line-clamp-1">
                              {title}
                            </h3>
                            {links.map((link) => {
                              const ds = deployStatus[link.url];
                              const isExpanded = expandedDeploy === link.url;
                              return (
                              <div key={link.url} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-1 items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:border-pink-200 hover:bg-pink-50/50"
                                  >
                                    <svg className="h-5 w-5 flex-shrink-0 text-zinc-700" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                    </svg>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-zinc-800">{link.repoName}</p>
                                      <p className="truncate text-xs text-zinc-400">{link.url}</p>
                                    </div>
                                    <svg className="h-4 w-4 flex-shrink-0 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </a>
                                  <button
                                    onClick={() => {
                                      if (sandboxRepo) {
                                        // Already have an active session — just bring it back
                                        setSandboxMinimized(false);
                                      } else {
                                        setSandboxRepo({ url: link.url, name: link.repoName });
                                        setSandboxMinimized(false);
                                      }
                                    }}
                                    className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-green-300 bg-green-50 px-3 py-2.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
                                    title="Run this code in a cloud sandbox using Modal + Claude"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Run on Modal
                                  </button>
                                </div>

                                {/* Deploy loading indicator with live status */}
                                {ds?.loading && (
                                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                    <div className="flex items-center gap-2">
                                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                      </svg>
                                      <span className="font-medium">AI agent is working...</span>
                                    </div>
                                    {ds.statusMessage && (
                                      <p className="mt-1 font-mono text-amber-700">{ds.statusMessage}</p>
                                    )}
                                    {/* Show steps streaming in while loading */}
                                    {ds.result?.steps && ds.result.steps.length > 0 && (
                                      <div className="mt-2 space-y-1.5 border-t border-amber-300/50 pt-2">
                                        <div className="max-h-48 overflow-y-auto space-y-1">
                                          {ds.result.steps.map((step, i) => (
                                            <div key={i} className="rounded bg-black/5 p-1.5 font-mono text-[10px]">
                                              <div className="flex items-center gap-2">
                                                <span className={step.exit_code === 0 ? "text-green-600" : "text-red-600"}>
                                                  {step.exit_code === 0 ? "OK" : `exit ${step.exit_code}`}
                                                </span>
                                                <span className="font-medium">$ {step.command}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Deploy error */}
                                {ds?.error && (
                                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                                    <p className="font-medium">Deploy failed</p>
                                    <p className="mt-1">{ds.error}</p>
                                  </div>
                                )}

                                {/* Deploy result */}
                                {ds?.result && !ds.loading && (
                                  <div className={`rounded-lg border p-3 text-xs ${
                                    ds.result.status === "success"
                                      ? "border-green-200 bg-green-50 text-green-800"
                                      : ds.result.status === "needs_input"
                                      ? "border-blue-200 bg-blue-50 text-blue-800"
                                      : ds.result.status === "max_steps_reached"
                                      ? "border-amber-200 bg-amber-50 text-amber-800"
                                      : ds.result.status === "running" ? "border-amber-200 bg-amber-50 text-amber-800"
                                      : "border-red-200 bg-red-50 text-red-800"
                                  }`}>
                                    <div className="flex items-center justify-between">
                                      <p className="font-medium">
                                        {ds.result.status === "success" ? "Completed" :
                                         ds.result.status === "needs_input" ? "Needs configuration" :
                                         ds.result.status === "max_steps_reached" ? "Partial (hit step limit)" : "Failed"}
                                        {ds.result.step_count && ` — ${ds.result.step_count} steps`}
                                        {ds.result.elapsed_seconds && ` in ${ds.result.elapsed_seconds}s`}
                                      </p>
                                      <button
                                        onClick={() => setExpandedDeploy(isExpanded ? null : link.url)}
                                        className="text-xs underline opacity-70 hover:opacity-100"
                                      >
                                        {isExpanded ? "Collapse" : "Show details"}
                                      </button>
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap">{ds.result.summary?.slice(0, 800)}</p>

                                    {/* Needs input — show env var form */}
                                    {ds.result.status === "needs_input" && (
                                      <div className="mt-3 space-y-2 border-t border-blue-200 pt-3">
                                        <p className="font-medium">Provide the required environment variables below, then click &quot;Run on Modal&quot; again:</p>
                                        <textarea
                                          className="w-full rounded border border-blue-300 bg-white p-2 font-mono text-[11px] text-zinc-800 placeholder:text-zinc-400"
                                          rows={6}
                                          placeholder={"# Paste KEY=VALUE pairs, one per line\nLLM_API_KEY=sk-...\nLLM_MODEL=gpt-4o\nEMBEDDING_API_KEY=..."}
                                          value={envVarsInput[link.url] || ""}
                                          onChange={(e) => setEnvVarsInput(prev => ({ ...prev, [link.url]: e.target.value }))}
                                        />
                                      </div>
                                    )}

                                    {isExpanded && ds.result.steps && ds.result.steps.length > 0 && (
                                      <div className="mt-3 space-y-2 border-t border-current/10 pt-3">
                                        <p className="font-medium opacity-70">Agent steps:</p>
                                        <div className="max-h-64 overflow-y-auto space-y-1.5">
                                          {ds.result.steps.map((step, i) => (
                                            <div key={i} className="rounded bg-black/5 p-2 font-mono text-[10px]">
                                              <div className="flex items-center gap-2">
                                                <span className={step.exit_code === 0 ? "text-green-600" : "text-red-600"}>
                                                  {step.exit_code === 0 ? "OK" : `exit ${step.exit_code}`}
                                                </span>
                                                <span className="font-medium">$ {step.command}</span>
                                              </div>
                                              {step.output && (
                                                <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap opacity-70">
                                                  {step.output.slice(0, 500)}
                                                </pre>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Env vars toggle (always available, even before first run) */}
                                {!ds?.loading && ds?.result?.status !== "needs_input" && (
                                  <div className="flex items-center">
                                    <button
                                      onClick={() => setShowEnvForm(showEnvForm === link.url ? null : link.url)}
                                      className="text-[10px] text-zinc-400 hover:text-zinc-600"
                                    >
                                      {showEnvForm === link.url ? "Hide env config" : "Configure env variables"}
                                    </button>
                                  </div>
                                )}
                                {showEnvForm === link.url && (
                                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
                                    <p className="mb-1.5 text-[10px] font-medium text-zinc-500">Environment variables (KEY=VALUE per line):</p>
                                    <textarea
                                      className="w-full rounded border border-zinc-300 bg-white p-2 font-mono text-[11px] text-zinc-800 placeholder:text-zinc-400"
                                      rows={4}
                                      placeholder={"API_KEY=sk-...\nMODEL=gpt-4o"}
                                      value={envVarsInput[link.url] || ""}
                                      onChange={(e) => setEnvVarsInput(prev => ({ ...prev, [link.url]: e.target.value }))}
                                    />
                                  </div>
                                )}
                              </div>
                              );
                            })}
                          </section>
                        ));
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right half - AI Search */}
          <div className="relative flex flex-1 flex-col" style={{ marginTop: '40px' }}>
            {/* Blurred background layer - extends beyond bounds for soft edges */}
            <div 
              className="absolute"
              style={{
                left: '-20px',
                right: '-20px', 
                top: '-30px',
                bottom: '-20px',
                background: '#FFFBEC',
                boxShadow: '0px 4px 4px rgba(0, 0, 0, 0.25)',
                borderRadius: '40px',
                filter: 'blur(15px)',
              }}
            ></div>
            
            {/* Content layer (sharp) */}
            <div 
              className="relative z-10 flex flex-1 flex-col overflow-hidden"
            >
            <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="space-y-4 text-center">
              <div className="text-4xl">💬</div>
              <h2 className="text-xl font-medium text-zinc-900 dark:text-white">
                Start exploring
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Ask about trends, compare approaches, or find related papers
              </p>
              <div className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
                {[
                  "What are the latest trends?",
                  "Show me influential papers",
                  "Compare different approaches",
                  "Find papers related to...",
                  ...(libraryPapers.length > 0
                    ? ["Summarize the papers in my library", "What do my library papers have in common?"]
                    : []),
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(suggestion)}
                    className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left text-sm text-zinc-700 transition-all hover:scale-[1.02] hover:border-pink-300 hover:bg-pink-50 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-pink-700 dark:hover:bg-pink-950/30"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="mb-8">
              {msg.role === "user" && (
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl bg-gradient-to-r from-pink-600 to-fuchsia-600 px-5 py-3 text-white shadow-md">
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              )}
              {msg.role === "assistant" && (
                <div className="flex">
                  <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <span className="text-sm">🤖</span>
                  </div>
                  <div className="max-w-[80%] rounded-2xl bg-white px-5 py-3 shadow-sm dark:bg-zinc-950">
                    <div className="prose prose-sm max-w-none text-zinc-900 dark:text-zinc-100 dark:prose-invert">
                      <ReactMarkdown
                        components={{
                          a: ({ node, ...props }) => (
                            <a
                              {...props}
                              className="text-pink-600 hover:underline dark:text-pink-400"
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          ),
                          h2: ({ node, ...props }) => (
                            <h2 {...props} className="mt-4 mb-2 text-base font-semibold" />
                          ),
                          ul: ({ node, ...props }) => (
                            <ul {...props} className="space-y-2 my-2" />
                          ),
                          li: ({ node, ...props }) => (
                            <li {...props} className="text-sm" />
                          ),
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                    {/* Paper cards for selection */}
                    {msg.papers && msg.papers.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            {msg.papers.length} papers found
                          </span>
                          {!savedToLibraryMessageIndices.has(i) && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => selectAllChatPapers(i, msg.papers!)}
                                className="text-xs text-pink-600 hover:text-pink-800 dark:text-pink-400 dark:hover:text-pink-300"
                              >
                                Select all
                              </button>
                              <button
                                type="button"
                                onClick={() => deselectAllChatPapers(i)}
                                className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </div>
                        {msg.papers.map((paper) => {
                          const isSelected = chatPaperSelections[i]?.has(paper.arxiv_id) ?? false;
                          const alreadyInLibrary = libraryPapers.some((lp) => lp.id === paper.arxiv_id);
                          const isSaved = savedToLibraryMessageIndices.has(i) && isSelected;
                          return (
                            <div
                              key={paper.arxiv_id}
                              onClick={() => {
                                if (!savedToLibraryMessageIndices.has(i) && !alreadyInLibrary) {
                                  toggleChatPaperSelection(i, paper.arxiv_id);
                                }
                              }}
                              className={`cursor-pointer rounded-lg border p-3 transition-all ${
                                alreadyInLibrary
                                  ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
                                  : isSaved
                                  ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
                                  : isSelected
                                  ? "border-pink-300 bg-pink-50 dark:border-pink-700 dark:bg-pink-950/30"
                                  : "border-zinc-200 bg-zinc-50 hover:border-pink-200 hover:bg-pink-50/50 dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-pink-800 dark:hover:bg-pink-950/20"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex-shrink-0">
                                  {alreadyInLibrary ? (
                                    <span className="text-green-500 dark:text-green-400" title="Already in library">✓</span>
                                  ) : isSaved ? (
                                    <span className="text-green-500 dark:text-green-400">✓</span>
                                  ) : (
                                    <div
                                      className={`h-4 w-4 rounded border-2 transition-colors ${
                                        isSelected
                                          ? "border-pink-500 bg-pink-500"
                                          : "border-zinc-300 dark:border-zinc-600"
                                      }`}
                                    >
                                      {isSelected && (
                                        <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <a
                                    href={paper.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-sm font-medium text-zinc-900 hover:text-pink-600 dark:text-zinc-100 dark:hover:text-pink-400"
                                  >
                                    {paper.title}
                                  </a>
                                  {paper.authors.length > 0 && (
                                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                      {paper.authors.slice(0, 3).join(", ")}
                                      {paper.authors.length > 3 && ` +${paper.authors.length - 3} more`}
                                    </p>
                                  )}
                                  {paper.categories.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {paper.categories.slice(0, 3).map((cat) => (
                                        <span key={cat} className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                                          {cat}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {alreadyInLibrary && (
                                    <span className="mt-1 inline-block text-[10px] text-green-600 dark:text-green-400">Already in library</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {!savedToLibraryMessageIndices.has(i) && (chatPaperSelections[i]?.size ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => saveSelectedChatPapers(i, msg.papers!)}
                            className="mt-2 w-full rounded-lg border border-pink-300 bg-pink-50 px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100 dark:border-pink-700 dark:bg-pink-950/40 dark:text-pink-300 dark:hover:bg-pink-950/60"
                          >
                            Add {chatPaperSelections[i].size} selected paper{chatPaperSelections[i].size !== 1 ? "s" : ""} to library
                          </button>
                        )}
                        {savedToLibraryMessageIndices.has(i) && (
                          <div className="mt-2 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
                            <span>✓</span>
                            <span>Added to library</span>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Fallback: old-style save for messages without structured papers */}
                    {(!msg.papers || msg.papers.length === 0) && extractPapersFromText(msg.text).length > 0 && (
                      savedToLibraryMessageIndices.has(i) ? (
                        <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400">
                          <span className="shrink-0 text-green-600 dark:text-green-400">✓</span>
                          <span>Saved to library</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSavedToLibraryMessageIndices((s) => new Set(s).add(i));
                            saveMessageToLibrary(msg.text);
                          }}
                          className="mt-3 flex items-center gap-2 rounded-lg border border-pink-300 bg-pink-50 px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100 dark:border-pink-700 dark:bg-pink-950/40 dark:text-pink-300 dark:hover:bg-pink-950/60"
                        >
                          <span>Save to library</span>
                          <span className="text-xs">({extractPapersFromText(msg.text).length} papers)</span>
                        </button>
                      )
                    )}
                    {/* Save to Notes button */}
                    {projectId && (
                      savedToNotesMessageIndices.has(i) ? (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                          <span>✓</span>
                          <span>Saved to notes</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            setSavedToNotesMessageIndices((s) => new Set(s).add(i));
                            try {
                              await apiFetch("/api/notes", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ content: msg.text }),
                              });
                              await fetchNotes();
                            } catch { /* best effort */ }
                          }}
                          className="mt-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
                          title="Save this response to your project notes"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Save to notes
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
              {msg.role === "system" && (
                <div className="mx-auto max-w-md rounded-xl border border-pink-200 bg-pink-50 px-4 py-3 text-center dark:border-pink-900 dark:bg-pink-950/30">
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                    {msg.text}
                  </p>
                </div>
              )}
              {msg.role === "error" && (
                <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
                  <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
                    {msg.text}
                  </p>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-start space-x-3">
              <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
                <span className="text-sm">🤖</span>
              </div>
              <div className="flex flex-col">
                <div className="flex space-x-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400"></div>
                  <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 delay-75"></div>
                  <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 delay-150"></div>
                </div>
                <p className="mt-2 text-xs text-zinc-500">{loadingStage}</p>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
            </div>

            {/* Input Area - inside AI search container */}
            <div className="border-t border-zinc-200/50 px-6 py-4">
              <form onSubmit={handleChatSubmit} className="mx-auto max-w-4xl">
                <div className="relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about papers, trends, or related research..."
                    disabled={loading}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-5 py-4 pr-14 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-pink-400"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-gradient-to-r from-pink-600 to-fuchsia-600 p-2.5 text-white shadow-lg hover:from-pink-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:hover:from-pink-600 disabled:hover:to-fuchsia-600"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  </button>
                </div>
                <p className="mt-2 text-center text-xs text-zinc-500">
                  Or{" "}
                  <Link
                    href="/reader/2401.04088"
                    className="text-pink-600 hover:underline dark:text-pink-400"
                  >
                    open a specific paper
                  </Link>
                </p>
              </form>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sandbox chat panel — stays mounted when minimized so state is preserved */}
      {sandboxRepo && (
        <SandboxPanel
          repoUrl={sandboxRepo.url}
          repoName={sandboxRepo.name}
          projectId={projectId}
          minimized={sandboxMinimized}
          onMinimize={() => setSandboxMinimized(true)}
          onRestore={() => setSandboxMinimized(false)}
          onClose={() => { setSandboxRepo(null); setSandboxMinimized(false); }}
        />
      )}
    </div>
  );
}

