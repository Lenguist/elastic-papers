"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const [arxivId, setArxivId] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = arxivId.trim().replace(/\.pdf$/i, "").replace(/v\d+$/i, "");
    if (id) router.push(`/reader/${id}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-white">Elastic Papers</h1>
      <p className="mb-8 text-zinc-600 dark:text-zinc-400">
        arXiv research assistant with semantic search
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-md">
        <input
          type="text"
          value={arxivId}
          onChange={(e) => setArxivId(e.target.value)}
          placeholder="Enter arXiv ID (e.g. 2601.12345)"
          className="mb-3 w-full rounded-lg border border-zinc-300 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700"
        >
          Open paper
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        Or try{" "}
        <a
          href="/reader/2401.04088"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          a sample paper
        </a>
      </p>
    </div>
  );
}
