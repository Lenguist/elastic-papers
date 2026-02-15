/**
 * In-memory sandbox session manager.
 * Stores conversation history and sandbox metadata for each active session.
 */

export type SandboxMessage = {
  role: "user" | "assistant";
  content: string | Array<{ type: string; [key: string]: unknown }>;
};

export type CommandStep = {
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
};

export type SandboxSession = {
  sandboxId: string;
  repoUrl: string;
  createdAt: number;
  messages: SandboxMessage[]; // Claude conversation history
  steps: CommandStep[];       // All commands executed
};

// Attach to globalThis so the store survives Next.js hot-reloads in dev mode.
// (Still lost on full server restart — fine for a demo.)
const globalSessions = globalThis as unknown as {
  __sandboxSessions?: Map<string, SandboxSession>;
};
if (!globalSessions.__sandboxSessions) {
  globalSessions.__sandboxSessions = new Map<string, SandboxSession>();
}
const sessions = globalSessions.__sandboxSessions;

export function createSession(sandboxId: string, repoUrl: string): SandboxSession {
  const session: SandboxSession = {
    sandboxId,
    repoUrl,
    createdAt: Date.now(),
    messages: [],
    steps: [],
  };
  sessions.set(sandboxId, session);
  return session;
}

export function getSession(sandboxId: string): SandboxSession | undefined {
  return sessions.get(sandboxId);
}

export function deleteSession(sandboxId: string): void {
  sessions.delete(sandboxId);
}

export function addMessage(sandboxId: string, message: SandboxMessage): void {
  const session = sessions.get(sandboxId);
  if (session) session.messages.push(message);
}

export function addStep(sandboxId: string, step: CommandStep): void {
  const session = sessions.get(sandboxId);
  if (session) session.steps.push(step);
}
