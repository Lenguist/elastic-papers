"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Paper = {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  pdfUrl: string;
  score?: number;
  categories?: string[];
};

const CATEGORIES = [
  { value: "cs.AI", label: "AI" },
  { value: "cs.LG", label: "Machine Learning" },
  { value: "cs.CV", label: "Computer Vision" },
  { value: "cs.CL", label: "NLP" },
  { value: "cs.GR", label: "Graphics" },
];

export default function DiscoveryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <span className="text-zinc-400">Loading...</span>
        </div>
      }
    >
      <DiscoveryPageInner />
    </Suspense>
  );
}

function DiscoveryPageInner() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const projectName = searchParams.get("name") || "Project";

  const [mode, setMode] = useState<"recommendations" | "browse">(
    projectId ? "recommendations" : "browse"
  );
  const [category, setCategory] = useState("cs.AI");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);
  const [expandedAbstracts, setExpandedAbstracts] = useState<Set<string>>(new Set());

  // Fetch recommendations
  useEffect(() => {
    if (mode !== "recommendations" || !projectId) {
      if (mode === "recommendations") setMode("browse");
      return;
    }
    setLoading(true);
    setPapers([]);
    fetch(
      `/api/discovery/recommendations?project_id=${encodeURIComponent(projectId)}`
    )
      .then((res) => res.json())
      .then((data) => {
        const recPapers = Array.isArray(data.papers) ? data.papers : [];
        setPapers(recPapers);
        // Auto-switch to browse if no recommendations found
        if (recPapers.length === 0) {
          setMode("browse");
        }
      })
      .catch(() => {
        setPapers([]);
        setMode("browse");
      })
      .finally(() => setLoading(false));
  }, [mode, projectId]);

  // Fetch category papers
  useEffect(() => {
    if (mode !== "browse") return;
    setLoading(true);
    setPapers([]);
    fetch(
      `/api/discovery/trending?category=${encodeURIComponent(category)}&limit=20`
    )
      .then((res) => res.json())
      .then((data) => {
        setPapers(Array.isArray(data.papers) ? data.papers : []);
      })
      .catch(() => setPapers([]))
      .finally(() => setLoading(false));
  }, [mode, category]);

  async function addToLibrary(paper: Paper) {
    if (!projectId) return;
    setAddingId(paper.id);
    try {
      await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          papers: [
            {
              id: paper.id,
              title: paper.title,
              url: `https://arxiv.org/abs/${paper.id}`,
              authors: paper.authors,
            },
          ],
        }),
      });
      setAddedIds((prev) => new Set(prev).add(paper.id));
    } finally {
      setAddingId(null);
    }
  }

  const backHref = projectId
    ? `/?project=${projectId}&name=${encodeURIComponent(projectName)}`
    : "/";

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden">
      {/* Gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #E7ECF6 33%, #FFE073 67%, #D34EA1 100%)",
        }}
      />
      <div
        className="absolute left-0 top-0 h-full w-full"
        style={{
          backgroundImage: "url(/gradient.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* White content container — matches main page layout */}
      <div
        className="absolute flex flex-col"
        style={{
          left: "calc(3.7vw)",
          top: "calc(5.7vh)",
          right: "calc(3.7vw)",
          bottom: "calc(5.7vh)",
          background: "#FFFFFF",
          borderRadius: "40px",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={backHref} className="flex items-center gap-3 hover:opacity-90">
              <img
                src="/logo.png"
                alt="logo"
                style={{
                  height: "56px",
                  width: "auto",
                  objectFit: "contain",
                }}
              />
              <span
                style={{
                  fontFamily: "Lato",
                  fontStyle: "italic",
                  fontWeight: 900,
                  fontSize: "22px",
                  color: "#AF247B",
                }}
              >
                research atelier
              </span>
            </Link>
            <span className="text-zinc-400">|</span>
            <span className="text-lg font-medium text-zinc-700">Discovery</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode toggle — only when project context exists */}
            {projectId && (
              <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                <button
                  onClick={() => setMode("recommendations")}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    mode === "recommendations"
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  For you
                </button>
                <button
                  onClick={() => setMode("browse")}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    mode === "browse"
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  Browse
                </button>
              </div>
            )}

            <Link
              href={backHref}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              ← Atelier (chat)
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Section header */}
          {mode === "recommendations" ? (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-zinc-900">
                Recommended for you
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Papers similar to what&apos;s in your library
              </p>
            </div>
          ) : (
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <h2 className="text-xl font-semibold text-zinc-900">
                Browse papers
              </h2>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-pink-600" />
              <p className="text-sm text-zinc-500">
                {mode === "recommendations"
                  ? "Finding recommendations based on your library..."
                  : "Loading papers..."}
              </p>
            </div>
          ) : papers.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 text-4xl">
                {mode === "recommendations" ? "📚" : "🔍"}
              </div>
              <p className="text-zinc-600">
                {mode === "recommendations"
                  ? "No recommendations yet."
                  : "No papers found. Try another category."}
              </p>
              {mode === "recommendations" && (
                <p className="mt-2 text-sm text-zinc-400">
                  Add more papers to your library or{" "}
                  <button
                    onClick={() => setMode("browse")}
                    className="text-pink-600 hover:underline"
                  >
                    browse by category
                  </button>
                  .
                </p>
              )}
            </div>
          ) : (
            /* Paper list */
            <ul className="space-y-4">
              {papers.map((paper) => {
                const isAdded = addedIds.has(paper.id);
                const isExpanded = expandedAbstracts.has(paper.id);
                return (
                  <li
                    key={paper.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      isAdded
                        ? "border-green-200 bg-green-50/30"
                        : "border-zinc-200 bg-zinc-50/50 hover:border-pink-200 hover:bg-pink-50/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <a
                          href={`https://arxiv.org/abs/${paper.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-zinc-900 hover:text-pink-600"
                        >
                          {paper.title}
                        </a>
                        {paper.authors.length > 0 && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {paper.authors.slice(0, 3).join(", ")}
                            {paper.authors.length > 3 ? " et al." : ""}
                          </p>
                        )}
                        {paper.categories && paper.categories.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {paper.categories.slice(0, 5).map((cat) => (
                              <span
                                key={cat}
                                className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600"
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                        {paper.abstract && (
                          <div className="mt-2">
                            <p
                              className={`text-sm text-zinc-600 ${
                                isExpanded ? "" : "line-clamp-2"
                              }`}
                            >
                              {paper.abstract}
                            </p>
                            {paper.abstract.length > 200 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedAbstracts((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(paper.id)) next.delete(paper.id);
                                    else next.add(paper.id);
                                    return next;
                                  })
                                }
                                className="mt-1 text-xs text-pink-600 hover:underline"
                              >
                                {isExpanded ? "collapse" : "expand"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <a
                        href={paper.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-pink-600 hover:underline"
                      >
                        PDF
                      </a>
                      {projectId &&
                        (isAdded ? (
                          <span className="text-xs font-medium text-green-600">
                            Added to library ✓
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToLibrary(paper)}
                            disabled={addingId === paper.id}
                            className="text-xs font-medium text-pink-600 hover:underline disabled:opacity-50"
                          >
                            {addingId === paper.id
                              ? "Adding…"
                              : "Add to library"}
                          </button>
                        ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
