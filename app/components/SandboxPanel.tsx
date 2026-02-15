"use client";

import { useState, useEffect, useRef } from "react";

type ChatEntry =
  | { type: "status"; text: string }
  | { type: "thinking"; text: string }
  | { type: "command"; command: string; stdout?: string; stderr?: string; exit_code?: number }
  | { type: "message"; text: string }
  | { type: "user"; text: string }
  | { type: "error"; text: string };

interface SandboxPanelProps {
  repoUrl: string;
  repoName: string;
  projectId?: string | null;
  minimized?: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
}

export default function SandboxPanel({ repoUrl, repoName, projectId, minimized, onMinimize, onRestore, onClose }: SandboxPanelProps) {
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(true);
  const [envInput, setEnvInput] = useState("");
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const createdRef = useRef(false);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  // Create sandbox on mount (guarded against strict-mode double-fire)
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    createSandbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createSandbox() {
    setCreating(true);
    setEntries([{ type: "status", text: `Creating sandbox and cloning ${repoUrl}...` }]);

    // Parse env vars
    const envVars: Record<string, string> = {};
    for (const line of envInput.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      }
    }

    try {
      const res = await fetch("/api/sandbox/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl, env_vars: envVars }),
      });
      const data = await res.json();

      if (data.error || !data.sandbox_id) {
        setEntries((prev) => [
          ...prev,
          { type: "error", text: data.error || "Failed to create sandbox" },
        ]);
        setCreating(false);
        return;
      }

      setSandboxId(data.sandbox_id);
      setEntries((prev) => [
        ...prev,
        { type: "status", text: `Sandbox ready (${data.sandbox_id.slice(0, 12)}...)` },
      ]);
      setCreating(false);

      // Auto-start: tell Claude to get the repo running
      sendMessage(data.sandbox_id, "Get this repository running. Start by reading the README and understanding what the project does, then install dependencies and run it.");
    } catch (err) {
      setEntries((prev) => [
        ...prev,
        { type: "error", text: `Failed to create sandbox: ${(err as Error).message}` },
      ]);
      setCreating(false);
    }
  }

  async function sendMessage(sbId: string, text: string) {
    if (!sbId || !text.trim() || loading) return;

    setEntries((prev) => [...prev, { type: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/sandbox/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandbox_id: sbId, message: text }),
      });

      if (!res.ok) {
        const data = await res.json();
        setEntries((prev) => [
          ...prev,
          { type: "error", text: data.error || `Error ${res.status}` },
        ]);
        setLoading(false);
        return;
      }

      // Read SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop()!;

        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split("\n");
          let eventType = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            if (line.startsWith("data: ")) data = line.slice(6);
          }

          if (!eventType || !data) continue;

          try {
            const parsed = JSON.parse(data);

            if (eventType === "thinking") {
              setEntries((prev) => [...prev, { type: "thinking", text: parsed.text }]);
            } else if (eventType === "command") {
              // Add command entry (output will be merged in via "output" event)
              setEntries((prev) => [
                ...prev,
                { type: "command", command: parsed.command },
              ]);
            } else if (eventType === "output") {
              // Update the last command entry with output
              setEntries((prev) => {
                const updated = [...prev];
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (
                    updated[i].type === "command" &&
                    (updated[i] as { command: string }).command === parsed.command
                  ) {
                    updated[i] = {
                      type: "command",
                      command: parsed.command,
                      stdout: parsed.stdout,
                      stderr: parsed.stderr,
                      exit_code: parsed.exit_code,
                    };
                    break;
                  }
                }
                return updated;
              });
            } else if (eventType === "message") {
              setEntries((prev) => [...prev, { type: "message", text: parsed.text }]);
            } else if (eventType === "error") {
              setEntries((prev) => [...prev, { type: "error", text: parsed.text }]);
            }
          } catch {
            /* ignore parse errors */
          }
        }
      }
    } catch (err) {
      setEntries((prev) => [
        ...prev,
        { type: "error", text: `Connection error: ${(err as Error).message}` },
      ]);
    }

    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sandboxId || !input.trim() || loading) return;
    sendMessage(sandboxId, input.trim());
  }

  async function saveToNotes() {
    if (!projectId || savingNote) return;
    setSavingNote(true);

    // Build a summary from the chat entries
    const commands = entries.filter((e) => e.type === "command") as Array<{
      type: "command"; command: string; stdout?: string; stderr?: string; exit_code?: number;
    }>;
    const messages = entries.filter((e) => e.type === "message") as Array<{ type: "message"; text: string }>;
    const errors = entries.filter((e) => e.type === "error") as Array<{ type: "error"; text: string }>;

    const successCount = commands.filter((c) => c.exit_code === 0).length;
    const failCount = commands.filter((c) => c.exit_code !== undefined && c.exit_code !== 0).length;

    // Summarize commands (show last few)
    const recentCommands = commands.slice(-6).map(
      (c) => `$ ${c.command}  →  ${c.exit_code === 0 ? "OK" : `exit ${c.exit_code}`}`
    ).join("\n");

    // Get Claude's last message as summary
    const lastMessage = messages.length > 0 ? messages[messages.length - 1].text : "";
    const summaryText = lastMessage.length > 500 ? lastMessage.slice(0, 500) + "..." : lastMessage;

    const noteContent = [
      `## Sandbox Run: ${repoName}`,
      `**Repo:** ${repoUrl}`,
      `**Date:** ${new Date().toLocaleDateString()}`,
      `**Commands:** ${commands.length} total (${successCount} succeeded, ${failCount} failed)`,
      errors.length > 0 ? `**Errors:** ${errors.length}` : "",
      "",
      "### Recent Commands",
      "```",
      recentCommands || "(none)",
      "```",
      "",
      summaryText ? `### Agent Summary\n${summaryText}` : "",
    ].filter(Boolean).join("\n");

    try {
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, content: noteContent }),
      });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 3000);
    } catch {
      /* best effort */
    }
    setSavingNote(false);
  }

  async function handleTerminate() {
    if (sandboxId) {
      try {
        await fetch("/api/sandbox/terminate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandbox_id: sandboxId }),
        });
      } catch { /* best effort */ }
    }
    onClose();
  }

  const modalDashboardUrl = `https://modal.com/apps/maksym-d-bondarenko/main/deployed/paper-demo-runner`;

  // Count commands for the minimized bar summary
  const commandCount = entries.filter((e) => e.type === "command").length;
  const lastStatus = loading ? "Working..." : creating ? "Setting up..." : "Idle";

  // ─── Minimized floating bar ────────────────────────────────────────────────
  if (minimized) {
    return (
      <div
        onClick={onRestore}
        className="fixed bottom-4 right-4 z-50 flex cursor-pointer items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
          <svg className="h-4 w-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-800">{repoName}</p>
          <p className="text-[10px] text-zinc-400">
            {loading || creating ? (
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                {lastStatus}
              </span>
            ) : (
              `${commandCount} commands run`
            )}
          </p>
        </div>
        <svg className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </div>
    );
  }

  // ─── Full panel ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-[85vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
              <svg className="h-4 w-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-800">{repoName}</h2>
              <p className="text-[10px] text-zinc-400">{sandboxId ? `Sandbox: ${sandboxId.slice(0, 16)}...` : "Creating..."}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sandboxId && (
              <a
                href={modalDashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
              >
                Open in Modal
              </a>
            )}
            {projectId && entries.length > 0 && (
              <button
                onClick={saveToNotes}
                disabled={savingNote}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  noteSaved
                    ? "border-green-300 bg-green-50 text-green-700"
                    : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                }`}
                title="Save a summary of this sandbox run to your project notes"
              >
                {savingNote ? "Saving..." : noteSaved ? "Saved!" : "Save to Notes"}
              </button>
            )}
            <button
              onClick={() => setShowEnvForm(!showEnvForm)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
              title="Configure environment variables"
            >
              Env Vars
            </button>
            <button
              onClick={onMinimize}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
              title="Minimize — sandbox keeps running"
            >
              Minimize
            </button>
            <button
              onClick={handleTerminate}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Close
            </button>
          </div>
        </div>

        {/* Env vars form (collapsible) */}
        {showEnvForm && (
          <div className="border-b border-zinc-200 bg-zinc-50/50 p-4">
            <p className="mb-2 text-xs font-medium text-zinc-500">Environment Variables (KEY=VALUE per line):</p>
            <textarea
              className="w-full rounded border border-zinc-300 bg-white p-2 font-mono text-xs text-zinc-800 placeholder:text-zinc-400"
              rows={4}
              placeholder={"API_KEY=sk-...\nMODEL=gpt-4o\nDATABASE_URL=..."}
              value={envInput}
              onChange={(e) => setEnvInput(e.target.value)}
            />
            <p className="mt-1 text-[10px] text-zinc-400">
              These will be written to .env in the repo. Takes effect on next sandbox creation.
            </p>
          </div>
        )}

        {/* Chat / terminal area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {entries.map((entry, i) => {
            if (entry.type === "status") {
              return (
                <div key={i} className="flex items-center gap-2 text-xs text-zinc-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                  {entry.text}
                </div>
              );
            }

            if (entry.type === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-pink-600 px-4 py-2.5 text-sm text-white">
                    {entry.text}
                  </div>
                </div>
              );
            }

            if (entry.type === "thinking") {
              return (
                <div key={i} className="text-xs italic text-zinc-400">
                  {entry.text.slice(0, 300)}
                </div>
              );
            }

            if (entry.type === "command") {
              const hasOutput = entry.stdout !== undefined;
              return (
                <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-900 font-mono text-xs overflow-hidden">
                  {/* Command line */}
                  <div className="flex items-center gap-2 border-b border-zinc-700 bg-zinc-800 px-3 py-1.5">
                    {hasOutput ? (
                      <span className={entry.exit_code === 0 ? "text-green-400" : "text-red-400"}>
                        {entry.exit_code === 0 ? "✓" : "✗"}
                      </span>
                    ) : (
                      <svg className="h-3 w-3 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    )}
                    <span className="text-green-400">$</span>
                    <span className="text-zinc-200">{entry.command}</span>
                  </div>
                  {/* Output */}
                  {hasOutput && (entry.stdout || entry.stderr) && (
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap p-3 text-zinc-300">
                      {entry.stdout}
                      {entry.stderr && (
                        <span className="text-red-400">{entry.stderr}</span>
                      )}
                    </pre>
                  )}
                </div>
              );
            }

            if (entry.type === "message") {
              return (
                <div key={i} className="flex">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-2.5 text-sm text-zinc-800">
                    <div className="whitespace-pre-wrap">{entry.text}</div>
                  </div>
                </div>
              );
            }

            if (entry.type === "error") {
              return (
                <div key={i} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
                  {entry.text}
                </div>
              );
            }

            return null;
          })}

          {/* Loading indicator */}
          {(loading || creating) && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {creating ? "Setting up sandbox..." : "Claude is working..."}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <form onSubmit={handleSubmit} className="border-t border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={loading ? "Claude is working..." : "Type a message or provide what Claude asks for..."}
              disabled={loading || creating || !sandboxId}
              className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-pink-400 disabled:bg-zinc-100 disabled:text-zinc-400"
            />
            <button
              type="submit"
              disabled={loading || creating || !sandboxId || !input.trim()}
              className="rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pink-700 disabled:bg-zinc-300"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
