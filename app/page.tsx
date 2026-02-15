"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";

type Message = {
  role: "user" | "assistant" | "error" | "system";
  text: string;
};

export default function HomePage() {
  const [scopeDefined, setScopeDefined] = useState(false);
  const [scopeInput, setScopeInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"library" | "notes">("library");
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
  }>>([]);
  const [authorsExpanded, setAuthorsExpanded] = useState<Set<string>>(new Set());
  const [abstractExpanded, setAbstractExpanded] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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
      bareArxiv.forEach(link => {
      const idMatch = link.match(/([0-9.]+)$/);
      if (idMatch && !seenIds.has(idMatch[1])) {
        seenIds.add(idMatch[1]);
        papers.push({
          id: idMatch[1],
          title: "",
          url: link,
        });
      }
    });

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
        await fetch("/api/library", {
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchLibrary() {
    try {
      const res = await fetch("/api/library");
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

  function handleScopeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const scope = scopeInput.trim();
    if (!scope) return;
    
    setScopeDefined(true);
    setMessages([
      {
        role: "system",
        text: `Research scope: ${scope}\n\nYou can now ask questions about trends, compare approaches, find related papers, or explore this research area.`,
      },
    ]);
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

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: text,
          scope: scopeInput 
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
        // Do not show arXiv IDs in the chat; auto-add returned papers to library
        const responseText = stripArxivIdsFromResponse(rawResponse);
        setMessages((m) => [...m, { role: "assistant", text: responseText }]);
        saveMessageToLibrary(rawResponse);
        fetchLibrary();
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
          className="absolute flex flex-col items-center justify-center"
          style={{
            left: 'calc(3.7vw)',
            top: 'calc(5.7vh)',
            right: 'calc(3.7vw)',
            bottom: 'calc(5.7vh)',
            background: '#FFFFFF',
            borderRadius: '40px',
          }}
        >
          <div className="w-full max-w-3xl px-8">
            {/* Logo & Title */}
            <div className="mb-12 text-center">
              <h1 className="flex items-start justify-center gap-3" style={{ fontFamily: 'Lato', fontStyle: 'italic', fontWeight: 900, fontSize: '45px', lineHeight: '54px', textAlign: 'center', color: '#AF247B' }}>
                <span style={{ position: 'relative', display: 'inline-block', background: 'linear-gradient(to top, #FFD84E 0%, #FFD84E 25%, transparent 25%, transparent 100%)' }}>
                  research
                </span>
                <img 
                  src="/logo.png" 
                  alt="logo" 
                  style={{ height: '90px', width: 'auto', objectFit: 'contain', imageRendering: 'crisp-edges' }}
                />
                <span style={{ position: 'relative', display: 'inline-block', background: 'linear-gradient(to top, #FFD84E 0%, #FFD84E 25%, transparent 25%, transparent 100%)' }}>
                  atelier
                </span>
              </h1>
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
                    placeholder="Define your research scope"
                    className="flex-1 text-lg text-zinc-700 placeholder-zinc-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="text-zinc-400 hover:text-zinc-600"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
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
            <div className="rounded-3xl border-2 border-dashed border-zinc-300 bg-zinc-50/50 py-8">
              <div className="text-center">
                <p className="mb-1 text-lg text-zinc-600">or drop your research notes and relevant publications</p>
                <p className="mb-6 text-sm text-zinc-500">
                  pdf, images, docs
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border-2 border-zinc-300 bg-white px-6 py-3 text-sm font-medium transition-all hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload files
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border-2 border-zinc-300 bg-white px-6 py-3 text-sm font-medium transition-all hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Websites
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border-2 border-zinc-300 bg-white px-6 py-3 text-sm font-medium transition-all hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    Drive
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border-2 border-zinc-300 bg-white px-6 py-3 text-sm font-medium transition-all hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              }}>{scopeInput}</span>
            </div>
            
            <Link
              href="/discovery"
              className="rounded-lg bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              style={{ border: '1px solid #E5E5E5' }}
            >
              Discovery
            </Link>
            <button
              onClick={() => {
                setScopeDefined(false);
                setMessages([]);
                setScopeInput("");
              }}
              className="rounded-lg bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              style={{
                border: '1px solid #E5E5E5',
              }}
            >
              Change Scope
            </button>
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
                className="flex items-center gap-2 border border-b-0 border-pink-600 bg-white px-4 py-1.5 text-sm"
                style={{
                  background: activeTab === "library" ? "#FFF" : "transparent",
                }}
              >
                <span>Library</span>
                <span className="text-xs" style={{ color: '#AF247B' }}>x</span>
              </button>
              <button
                onClick={() => setActiveTab("notes")}
                className="flex items-center gap-2 border border-b-0 border-l-0 border-pink-600 bg-white px-4 py-1.5 text-sm"
                style={{
                  background: activeTab === "notes" ? "#FFF" : "transparent",
                }}
              >
                <span>Notes</span>
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
                    libraryPapers.map((paper) => {
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
                          : "Untitled";
                      const publishedLabel = paper.publishedDate
                        ? new Date(paper.publishedDate + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : paper.publishedYear
                          ? paper.publishedYear
                          : null;
                      return (
                        <div
                          key={paper.id}
                          className="rounded-lg border border-zinc-200 bg-white p-3 hover:border-pink-300 hover:bg-pink-50"
                        >
                          <div className="flex items-start justify-between gap-2">
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
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await fetch("/api/library/approve", {
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
                                    await fetch("/api/library/remove", {
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
                            <div className="mt-2">
                              <p
                                className={`text-xs text-zinc-600 ${abstractExpanded.has(paper.id) ? "" : "line-clamp-2"}`}
                                title={abstractExpanded.has(paper.id) ? undefined : paper.abstract}
                              >
                                {paper.abstract}
                              </p>
                              <button
                                type="button"
                                onClick={() => setAbstractExpanded((s) => {
                                  const next = new Set(s);
                                  if (next.has(paper.id)) next.delete(paper.id);
                                  else next.add(paper.id);
                                  return next;
                                })}
                                className="mt-0.5 text-xs text-pink-600 hover:underline"
                              >
                                {abstractExpanded.has(paper.id) ? "collapse" : "expand"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              
              {activeTab === "notes" && (
                <div>
                  <p className="text-sm text-zinc-500">Notes feature coming soon...</p>
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
                    {extractPapersFromText(msg.text).length > 0 && (
                      <button
                        type="button"
                        onClick={() => saveMessageToLibrary(msg.text)}
                        className="mt-3 flex items-center gap-2 rounded-lg border border-pink-300 bg-pink-50 px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100 dark:border-pink-700 dark:bg-pink-950/40 dark:text-pink-300 dark:hover:bg-pink-950/60"
                      >
                        <span>Save to library</span>
                        <span className="text-xs">({extractPapersFromText(msg.text).length} papers)</span>
                      </button>
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
    </div>
  );
}

