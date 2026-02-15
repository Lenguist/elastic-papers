"use client";

import { useState, useRef, useEffect } from "react";

type ChatSidebarProps = {
  projectId?: string | null;
};

export default function ChatSidebar({ projectId }: ChatSidebarProps) {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, project_id: projectId || undefined }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages((m) => [
          ...m,
          { role: "error", text: data.error + (data.detail ? "\n" + data.detail.slice(0, 150) : "") },
        ]);
      } else {
        setMessages((m) => [...m, { role: "assistant", text: data.response || "" }]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "error", text: "Request failed: " + (err instanceof Error ? err.message : String(err)) },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="font-semibold text-zinc-900 dark:text-white">arXiv Assistant</h2>
        <p className="text-xs text-zinc-500">Ask about papers, find related work</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">Ask a question about the paper or related research.</p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === "user"
                ? "ml-4 text-sm text-blue-700 dark:text-blue-300"
                : msg.role === "error"
                  ? "ml-4 text-sm text-red-600 dark:text-red-400"
                  : "text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap"
            }
          >
            {msg.text}
          </div>
        ))}
        {loading && <p className="text-sm text-zinc-500">Thinking...</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about papers..."
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
