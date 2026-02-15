"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Paper = {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  pdfUrl: string;
};

const CATEGORIES = [
  { value: "cs.AI", label: "AI" },
  { value: "cs.LG", label: "Machine Learning" },
  { value: "cs.CV", label: "Computer Vision" },
  { value: "cs.CL", label: "NLP" },
  { value: "cs.GR", label: "Graphics" },
];

export default function DiscoveryPage() {
  const [category, setCategory] = useState("cs.AI");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/discovery/trending?category=${encodeURIComponent(category)}&limit=20`)
      .then((res) => res.json())
      .then((data) => {
        setPapers(Array.isArray(data.papers) ? data.papers : []);
      })
      .catch(() => setPapers([]))
      .finally(() => setLoading(false));
  }, [category]);

  async function addToLibrary(paper: Paper) {
    setAddingId(paper.id);
    try {
      await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(180deg, #E7ECF6 33%, #FFE073 67%, #D34EA1 100%)",
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

      {/* White content container */}
      <div
        className="relative flex flex-1 flex-col"
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
            <Link
              href="/"
              className="flex items-center gap-3 hover:opacity-90"
            >
              <img
                src="/logo.png"
                alt="logo"
                style={{ height: "56px", width: "auto", objectFit: "contain" }}
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
          <Link
            href="/"
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            ← Atelier (chat)
          </Link>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <h2 className="text-xl font-semibold text-zinc-900">Trending papers</h2>
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

          {loading ? (
            <p className="text-zinc-500">Loading…</p>
          ) : papers.length === 0 ? (
            <p className="text-zinc-500">No papers found. Try another category.</p>
          ) : (
            <ul className="space-y-4">
              {papers.map((paper) => (
                <li
                  key={paper.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 hover:border-pink-200 hover:bg-pink-50/30"
                >
                  <a
                    href={`https://arxiv.org/abs/${paper.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-zinc-900 hover:text-pink-600"
                  >
                    {paper.title}
                  </a>
                  <p className="mt-1 text-xs text-zinc-500">
                    arXiv:{paper.id}
                    {paper.authors.length > 0 && ` · ${paper.authors.slice(0, 3).join(", ")}${paper.authors.length > 3 ? " et al." : ""}`}
                  </p>
                  {paper.abstract && (
                    <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                      {paper.abstract}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={paper.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-pink-600 hover:underline"
                    >
                      PDF
                    </a>
                    <button
                      type="button"
                      onClick={() => addToLibrary(paper)}
                      disabled={addingId === paper.id}
                      className="text-xs font-medium text-pink-600 hover:underline disabled:opacity-50"
                    >
                      {addingId === paper.id ? "Adding…" : "Add to library"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
