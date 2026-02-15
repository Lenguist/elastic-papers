"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import ChatSidebar from "@/components/ChatSidebar";

const PDF_URL = (id: string) => `https://arxiv.org/pdf/${id}.pdf`;

export default function ReaderPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><span className="text-zinc-400">Loading...</span></div>}>
      <ReaderPageInner />
    </Suspense>
  );
}

function ReaderPageInner() {
  const params = useParams<{ arxivId: string }>();
  const searchParams = useSearchParams();
  const arxivId = params?.arxivId?.replace(/\.pdf$/i, "").replace(/v\d+$/i, "") || "";
  const projectId = searchParams.get("project");

  return (
    <div className="flex h-screen">
      {/* Main: PDF viewer */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400">
            ← Back
          </Link>
          {arxivId && (
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              arXiv:{arxivId}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-hidden bg-zinc-100 dark:bg-zinc-900">
          {arxivId ? (
            <iframe
              src={PDF_URL(arxivId)}
              title={`Paper ${arxivId}`}
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-500">
              No paper selected
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar: Chat */}
      <aside className="w-96 shrink-0">
        <ChatSidebar projectId={projectId} />
      </aside>
    </div>
  );
}
