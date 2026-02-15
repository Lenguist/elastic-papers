import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSession, addMessage, addStep } from "@/lib/sandbox-session";
import { getExecCommandUrl } from "@/lib/modal-urls";

const CLAUDE_MODEL = process.env.CLAUDE_SANDBOX_MODEL || "claude-sonnet-4-20250514";
const MAX_TOOL_ROUNDS = 15; // max tool-use rounds per turn

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a deployment agent working in a live interactive sandbox session.
You're helping the user get a GitHub repository running in a cloud container.

You have one tool: execute_command — it runs a shell command in the sandbox.
The sandbox is persistent: packages you install stay installed, files you create persist,
environment variables you set stick around.

RULES:
1. Start by exploring: ls, cat README.md, look at the project structure.
2. Follow the README's setup instructions carefully.
3. When you pip-install, use --quiet to reduce noise.
4. If a command fails, read the error, try to fix it, and retry. Try up to 3 fixes per error.
5. If the repo needs API keys, credentials, or configuration that you don't have — ASK THE USER.
   Be specific: "I need an OpenAI API key for the LLM evaluator. Could you provide one?"
   The user can type their response and you'll receive it.
6. If the repo is a web app (Gradio, Streamlit, FastAPI), start it in the background
   and verify it's running (curl localhost:<port>).
7. If it requires a GPU, try CPU mode. If not possible, explain why.
8. Keep commands short. Check output between steps. Don't chain with &&.
9. When done (success or failure), give a clear summary.

COMMUNICATION STYLE:
- Be conversational. You're pair-programming with the user.
- Explain what you're doing and why before running commands.
- When you need something from the user, ask clearly and wait.
- Celebrate small wins ("Dependencies installed! Now let's try running it...")

CONSTRAINTS:
- CPU only (no GPU).
- Internet access available.
- Working directory: /root/repo (the cloned repository).
- Command timeout: 120 seconds.
- Be efficient — aim to get things running in under 20 commands.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "execute_command",
    description:
      "Execute a shell command in the sandbox. The command runs from /root/repo. " +
      "Returns stdout, stderr, and exit code. Timeout: 120 seconds.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to run.",
        },
      },
      required: ["command"],
    },
  },
];

async function execInSandbox(
  sandboxId: string,
  command: string
): Promise<{ stdout: string; stderr: string; exit_code: number }> {
  const execUrl = getExecCommandUrl();

  const res = await fetch(execUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sandbox_id: sandboxId, command }),
  });

  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || !contentType.includes("application/json")) {
    const text = await res.text();
    return {
      stdout: "",
      stderr: `Modal error ${res.status}: ${text.slice(0, 500)}`,
      exit_code: -1,
    };
  }

  return res.json();
}

/**
 * POST /api/sandbox/message
 *
 * Sends a user message to the Claude agent for a sandbox session.
 * Streams back SSE events as Claude thinks and executes commands.
 *
 * Body: { "sandbox_id": "...", "message": "Get this running" }
 *
 * SSE events:
 *   event: thinking   — { "text": "Let me look at the README..." }
 *   event: command     — { "command": "ls -la" }
 *   event: output      — { "command": "ls -la", "stdout": "...", "stderr": "...", "exit_code": 0 }
 *   event: message     — { "text": "I need an API key..." }  (Claude's response to user)
 *   event: error       — { "text": "..." }
 *   event: done        — {}
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const sandboxId = body.sandbox_id as string;
  const userMessage = body.message as string;

  if (!sandboxId || !userMessage) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ text: "sandbox_id and message are required" })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const session = getSession(sandboxId);
  if (!session) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ text: "Session not found. The sandbox may have expired." })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ text: "ANTHROPIC_API_KEY not configured" })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  // Add user message to history
  addMessage(sandboxId, { role: "user", content: userMessage });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: string, data: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        // Build messages for Claude (full conversation history)
        const claudeMessages: Anthropic.MessageParam[] = session.messages.map((m) => ({
          role: m.role,
          content: m.content as string | Anthropic.ContentBlockParam[],
        }));

        let toolRounds = 0;

        // Agent loop: Claude thinks → executes tools → thinks again → ...
        while (toolRounds < MAX_TOOL_ROUNDS) {
          const response = await anthropic.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: TOOLS,
            messages: claudeMessages,
          });

          // Store assistant response in conversation
          const assistantContent = response.content;
          addMessage(sandboxId, { role: "assistant", content: assistantContent as unknown as string });
          claudeMessages.push({ role: "assistant", content: assistantContent });

          // Process response blocks
          const textBlocks: string[] = [];
          const toolUseBlocks: Array<{ id: string; command: string }> = [];

          for (const block of response.content) {
            if (block.type === "text") {
              textBlocks.push(block.text);
            } else if (block.type === "tool_use") {
              const cmd = (block.input as { command: string }).command;
              toolUseBlocks.push({ id: block.id, command: cmd });
            }
          }

          // Emit any thinking/text from Claude
          if (textBlocks.length > 0) {
            const fullText = textBlocks.join("\n");
            emit("thinking", { text: fullText });
          }

          // If Claude is done (no tool calls), emit final message and break
          if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
            const finalText = textBlocks.join("\n");
            if (finalText) {
              emit("message", { text: finalText });
            }
            break;
          }

          // Execute tool calls
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const tool of toolUseBlocks) {
            emit("command", { command: tool.command });

            const result = await execInSandbox(sandboxId, tool.command);

            // Store step
            addStep(sandboxId, {
              command: tool.command,
              stdout: result.stdout,
              stderr: result.stderr,
              exit_code: result.exit_code,
            });

            emit("output", {
              command: tool.command,
              stdout: result.stdout?.slice(0, 3000) || "",
              stderr: result.stderr?.slice(0, 2000) || "",
              exit_code: result.exit_code,
            });

            const outputStr =
              `exit_code: ${result.exit_code}\n` +
              `stdout:\n${result.stdout || "(empty)"}\n` +
              `stderr:\n${result.stderr || "(empty)"}`;

            toolResults.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: outputStr,
            });
          }

          // Feed tool results back to Claude
          addMessage(sandboxId, {
            role: "user",
            content: toolResults as unknown as string,
          });
          claudeMessages.push({ role: "user", content: toolResults });

          toolRounds++;
        }

        emit("done", {});
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ text: (err as Error).message })}\n\n`
          )
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
