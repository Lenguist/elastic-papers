"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this project? Library and notes will be removed.")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/projects?id=${id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  }

  function openProject(project: Project) {
    router.push(`/?project=${encodeURIComponent(project.id)}&name=${encodeURIComponent(project.name)}`);
  }

  function formatDate(dateStr: string) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Gradient background matching landing */}
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

      {/* White content area */}
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
        <div className="flex items-center justify-between border-b border-zinc-100 px-10 py-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm">New Project</span>
            </Link>
          </div>
          <h1
            className="text-xl"
            style={{
              fontFamily: "Lato",
              fontStyle: "italic",
              fontWeight: 900,
              color: "#AF247B",
            }}
          >
            Your Projects
          </h1>
          <Link
            href="/discovery"
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            Discovery
          </Link>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-300 border-t-pink-600" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 rounded-full bg-pink-50 p-4">
                <svg className="h-8 w-8 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-lg font-medium text-zinc-700">No projects yet</p>
              <p className="mt-1 text-sm text-zinc-400">
                Create your first project from the{" "}
                <Link href="/" className="text-pink-600 hover:underline">
                  home page
                </Link>
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="group relative flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-pink-200 hover:shadow-md"
                >
                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProject(project.id);
                    }}
                    disabled={deletingId === project.id}
                    className="absolute right-4 top-4 rounded-full p-1.5 text-zinc-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    title="Delete project"
                  >
                    {deletingId === project.id ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-300 border-t-red-600" />
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>

                  {/* Project content - clickable */}
                  <button
                    type="button"
                    onClick={() => openProject(project)}
                    className="flex flex-1 flex-col text-left"
                  >
                    <h3
                      className="mb-2 pr-8 text-lg font-bold text-zinc-800 group-hover:text-pink-700 transition-colors"
                      style={{ fontFamily: "Lato" }}
                    >
                      {project.name}
                    </h3>
                    <p className="mb-4 flex-1 text-sm leading-relaxed text-zinc-500 line-clamp-3">
                      {project.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">
                        {formatDate(project.createdAt)}
                      </span>
                      <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-600 opacity-0 transition-opacity group-hover:opacity-100">
                        Open
                      </span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
