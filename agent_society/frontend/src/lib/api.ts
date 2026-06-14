import type { Agent, AgentMemory, AgentRelationship } from "@/types/agent";
import type { Meeting, MeetingMessage, SseEvent, Vote } from "@/types/meeting";

// Regular JSON calls go through the Next.js proxy.
const BASE = "/api";

// SSE / streaming calls go DIRECT to the backend so Next.js dev-server
// rewrites don't buffer chunked responses (the chunks arrive byte-by-byte
// when bypassing the proxy, but Next.js dev buffers them through /api/*).
// In the browser, window.location lets us pin the same hostname while
// switching the port. Fall back to localhost during SSR (api.ts is only
// imported by client components, but be safe).
function backendOrigin(): string {
  if (typeof window === "undefined") return "http://localhost:8000";
  const env = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (env) return env;
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch(`${BASE}/agents`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`);
  return res.json();
}

export async function fetchAgent(id: string): Promise<Agent> {
  const res = await fetch(`${BASE}/agents/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch agent: ${res.status}`);
  return res.json();
}

export async function fetchAgentMemories(id: string): Promise<AgentMemory[]> {
  const res = await fetch(`${BASE}/agents/${id}/memories`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch memories: ${res.status}`);
  return res.json();
}

export async function fetchAgentRelationships(id: string): Promise<AgentRelationship[]> {
  const res = await fetch(`${BASE}/agents/${id}/relationships`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch relationships: ${res.status}`);
  return res.json();
}

// ── Memory management ─────────────────────────────────────────────────────

export async function addAgentMemory(
  agentId: string,
  content: string,
): Promise<AgentMemory> {
  const res = await fetch(`${BASE}/agents/${agentId}/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, memory_type: "manual" }),
  });
  if (!res.ok) throw new Error(`add memory failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function editAgentMemory(
  agentId: string,
  memoryId: number,
  content: string,
): Promise<void> {
  const res = await fetch(`${BASE}/agents/${agentId}/memories/${memoryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`edit memory failed: ${res.status} ${await res.text()}`);
}

export async function deleteAgentMemory(agentId: string, memoryId: number): Promise<void> {
  const res = await fetch(`${BASE}/agents/${agentId}/memories/${memoryId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`delete memory failed: ${res.status} ${await res.text()}`);
}

export async function resetAgentMemories(agentId: string): Promise<void> {
  const res = await fetch(`${BASE}/agents/${agentId}/memories`, { method: "DELETE" });
  if (!res.ok) throw new Error(`reset agent memories failed: ${res.status} ${await res.text()}`);
}

export async function resetAllMemories(): Promise<void> {
  const res = await fetch(`${BASE}/memories`, { method: "DELETE" });
  if (!res.ok) throw new Error(`reset all memories failed: ${res.status} ${await res.text()}`);
}

export async function proceedMeeting(
  meetingId: string,
  interjection?: string,
): Promise<void> {
  const res = await fetch(`${BASE}/meetings/${meetingId}/proceed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interjection: interjection ?? null }),
  });
  if (!res.ok) {
    throw new Error(`Failed to proceed meeting: ${res.status} ${await res.text()}`);
  }
}

export async function createMeeting(
  scenario: string,
  maxLevel = 3,
  groupId?: string | null,
): Promise<Meeting> {
  const res = await fetch(`${BASE}/meetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, max_level: maxLevel, group_id: groupId ?? null }),
  });
  if (!res.ok) throw new Error(`Failed to create meeting: ${res.status}`);
  const data = await res.json();
  return {
    id: data.meeting_id,
    scenario: data.scenario,
    status: data.status,
    created_at: new Date().toISOString(),
    result_summary: null,
    max_level: data.max_level ?? maxLevel,
  };
}

/** Full ordered event log for a meeting (used for replay + loading a saved state). */
export async function fetchMeetingEvents(meetingId: string): Promise<import("@/types/meeting").SseEvent[]> {
  const res = await fetch(`${BASE}/meetings/${meetingId}/events`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
  return res.json();
}

export async function listMeetings(): Promise<Meeting[]> {
  const res = await fetch(`${BASE}/meetings`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to list meetings: ${res.status}`);
  return res.json();
}

export async function renameMeeting(meetingId: string, name: string): Promise<void> {
  const res = await fetch(`${BASE}/meetings/${meetingId}/name`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to rename meeting: ${res.status}`);
}

// ── Hippocampus memory groups (ChatGPT-style conversation threads) ──────────
export interface MemoryGroup {
  id: string;
  name: string;
  created_at: string;
  condensed?: string;
  meeting_count?: number;
}
export interface MemoryGroupDetail extends MemoryGroup {
  meetings: { id: string; scenario: string; status: string; name: string | null; created_at: string }[];
}

export async function createGroup(name?: string): Promise<MemoryGroup> {
  const res = await fetch(`${BASE}/memory_groups`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name ?? null }),
  });
  if (!res.ok) throw new Error(`create group failed: ${res.status}`);
  return res.json();
}

export async function listGroups(): Promise<MemoryGroup[]> {
  const res = await fetch(`${BASE}/memory_groups`, { cache: "no-store" });
  if (!res.ok) throw new Error(`list groups failed: ${res.status}`);
  return res.json();
}

export async function getGroup(groupId: string): Promise<MemoryGroupDetail> {
  const res = await fetch(`${BASE}/memory_groups/${groupId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`get group failed: ${res.status}`);
  return res.json();
}

export async function renameGroup(groupId: string, name: string): Promise<void> {
  const res = await fetch(`${BASE}/memory_groups/${groupId}/name`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`rename group failed: ${res.status}`);
}

export interface ObserverBriefingPreview {
  available: boolean;
  backend: string | null;
  lookback_hours: number;
  keywords: string[];
  activity_summary: string;
  observation_snippets: string[];
  rendered_block: string;
}

/** Preview the Observer briefing that WOULD be sent if include_observer_context=true.
 *  Failure (bridge offline, network) is treated as "no briefing" by the caller. */
export async function fetchObserverBriefingPreview(
  scenario: string,
): Promise<ObserverBriefingPreview | null> {
  if (!scenario.trim()) return null;
  const res = await fetch(
    `${BASE}/observer/briefing_preview?scenario=${encodeURIComponent(scenario)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json();
}

export interface ObserverHealth {
  available: boolean;
  backend: string | null;
  detail: string;
  last_error: string | null;
}

export async function fetchObserverHealth(): Promise<ObserverHealth> {
  const res = await fetch(`${BASE}/observer/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(`observer health: ${res.status}`);
  return res.json();
}

export interface ToolInventory {
  tool_names: string[];
  tool_capable_models: string[];
}

/** Diagnostic — what tools the backend has registered. Used by the UI to
 *  show "N tools available" next to the enable-tools checkbox. Failure is
 *  treated as "unknown" by the caller, never as an error. */
export async function fetchToolInventory(): Promise<ToolInventory> {
  const res = await fetch(`${BASE}/tools`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch tools: ${res.status}`);
  const data = await res.json();
  return {
    tool_names: Array.isArray(data?.tool_names) ? data.tool_names : [],
    tool_capable_models: Array.isArray(data?.tool_capable_models)
      ? data.tool_capable_models
      : [],
  };
}

export async function fetchMeetingMessages(meetingId: string): Promise<MeetingMessage[]> {
  const res = await fetch(`${BASE}/meetings/${meetingId}/messages`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
  return res.json();
}

export async function fetchMeetingVotes(meetingId: string): Promise<Vote[]> {
  const res = await fetch(`${BASE}/meetings/${meetingId}/votes`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch votes: ${res.status}`);
  return res.json();
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export async function fetchChatHistory(
  agentId: string,
  sessionId: string,
): Promise<ChatMessage[]> {
  const res = await fetch(
    `${BASE}/agents/${agentId}/chat/${encodeURIComponent(sessionId)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Failed to fetch chat history: ${res.status}`);
  return res.json();
}

/**
 * Open an SSE stream for a live meeting.
 * Returns a close() function. The backend pops the queue on disconnect,
 * so we do NOT auto-reconnect — first error closes the stream.
 */
export function streamMeeting(
  meetingId: string,
  onEvent: (e: SseEvent) => void,
  onError?: (err: Event) => void,
): () => void {
  // Direct to backend (NOT through /api proxy) — see backendOrigin() comment.
  const es = new EventSource(`${backendOrigin()}/meetings/${meetingId}/stream`);

  es.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as SseEvent;
      onEvent(parsed);
    } catch (err) {
      console.warn("SSE parse error", err, msg.data);
    }
  };

  es.onerror = (err) => {
    es.close();
    onError?.(err);
  };

  return () => es.close();
}

/**
 * Direct chat with a single agent. Uses POST + ReadableStream because
 * EventSource only supports GET.
 *
 * Returns a cancel() function that aborts the request.
 */
export function streamAgentChat(
  agentId: string,
  sessionId: string,
  message: string,
  onToken: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      // Direct to backend — chat is also a streaming response (token-by-token).
      const res = await fetch(`${backendOrigin()}/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, session_id: sessionId }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`chat ${res.status}: ${await res.text()}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by "\n\n"
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const parsed = JSON.parse(data) as { text?: string; done?: boolean };
            if (parsed.done) {
              onDone();
              return;
            }
            if (typeof parsed.text === "string") {
              onToken(parsed.text);
            }
          } catch (e) {
            console.warn("chat SSE parse error", e, data);
          }
        }
      }
      onDone();
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return () => controller.abort();
}
