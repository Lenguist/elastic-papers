"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    try {
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
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-900">
      {/* Header with gradient */}
      <div className="border-b border-pink-200 bg-gradient-to-r from-pink-500 to-fuchsia-500 px-6 py-4 shadow-lg dark:border-pink-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-start gap-2">
            <Image 
              src="/logo.png" 
              alt="logo" 
              width={90} 
              height={90} 
              className="w-auto object-contain"
              style={{ imageRendering: 'crisp-edges', height: 'auto', maxHeight: '80px' }}
            />
            <h1 className="text-lg font-semibold text-white drop-shadow">research atelier</h1>
            <p className="ml-2 text-sm text-white/90 drop-shadow-sm">
              • {scopeInput}
            </p>
          </div>
          <button
            onClick={() => {
              setScopeDefined(false);
              setMessages([]);
              setScopeInput("");
            }}
            className="rounded-lg border border-white/30 bg-white/20 px-3 py-1.5 text-sm text-white backdrop-blur-sm hover:bg-white/30"
          >
            Change Scope
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
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
                    <p className="text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
                      {msg.text}
                    </p>
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
            <div className="flex items-center space-x-2">
              <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
                <span className="text-sm">🤖</span>
              </div>
              <div className="flex space-x-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400"></div>
                <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 delay-75"></div>
                <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 delay-150"></div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
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
  );
}

