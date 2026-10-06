import type { AgentStreamPayload } from "@/types/jarvis";

/** Decode SSE through EOF, including a final frame without a trailing newline. */
export async function* readAgentStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<AgentStreamPayload> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    return JSON.parse(trimmed.slice(5).trim()) as AgentStreamPayload;
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) { const payload = parse(line); if (payload) yield payload; }
      if (done) {
        const payload = parse(buffer);
        if (payload) yield payload;
        return;
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
