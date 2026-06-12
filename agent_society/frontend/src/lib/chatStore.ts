import { create } from "zustand";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming: boolean;
}

interface ChatThread {
  turns: ChatTurn[];
  isStreaming: boolean;
  error: string | null;
}

interface ChatState {
  // Stable session id per browser tab — one per agent. (chatStore is in-memory,
  // so a hard refresh starts a new session; persisted backend history still loads.)
  sessionId: string;
  threads: Record<string, ChatThread>;

  threadOf: (agentId: string) => ChatThread;
  appendUser: (agentId: string, content: string) => string;
  beginAssistant: (agentId: string) => string;
  appendAssistantToken: (agentId: string, turnId: string, token: string) => void;
  finishAssistant: (agentId: string, turnId: string) => void;
  setError: (agentId: string, error: string | null) => void;
  setStreaming: (agentId: string, streaming: boolean) => void;
  setHistory: (agentId: string, turns: ChatTurn[]) => void;
  clearThread: (agentId: string) => void;
}

const EMPTY_THREAD: ChatThread = { turns: [], isStreaming: false, error: null };
const newId = () => Math.random().toString(36).slice(2, 10);

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: `session-${Date.now().toString(36)}-${newId()}`,
  threads: {},

  threadOf: (agentId) => get().threads[agentId] ?? EMPTY_THREAD,

  appendUser: (agentId, content) => {
    const turnId = newId();
    set((state) => {
      const prev = state.threads[agentId] ?? EMPTY_THREAD;
      return {
        threads: {
          ...state.threads,
          [agentId]: {
            ...prev,
            turns: [...prev.turns, { id: turnId, role: "user", content, streaming: false }],
            error: null,
          },
        },
      };
    });
    return turnId;
  },

  beginAssistant: (agentId) => {
    const turnId = newId();
    set((state) => {
      const prev = state.threads[agentId] ?? EMPTY_THREAD;
      return {
        threads: {
          ...state.threads,
          [agentId]: {
            ...prev,
            isStreaming: true,
            turns: [
              ...prev.turns,
              { id: turnId, role: "assistant", content: "", streaming: true },
            ],
          },
        },
      };
    });
    return turnId;
  },

  appendAssistantToken: (agentId, turnId, token) =>
    set((state) => {
      const prev = state.threads[agentId];
      if (!prev) return state;
      return {
        threads: {
          ...state.threads,
          [agentId]: {
            ...prev,
            turns: prev.turns.map((t) =>
              t.id === turnId ? { ...t, content: t.content + token } : t,
            ),
          },
        },
      };
    }),

  finishAssistant: (agentId, turnId) =>
    set((state) => {
      const prev = state.threads[agentId];
      if (!prev) return state;
      return {
        threads: {
          ...state.threads,
          [agentId]: {
            ...prev,
            isStreaming: false,
            turns: prev.turns.map((t) =>
              t.id === turnId ? { ...t, streaming: false } : t,
            ),
          },
        },
      };
    }),

  setError: (agentId, error) =>
    set((state) => {
      const prev = state.threads[agentId] ?? EMPTY_THREAD;
      return {
        threads: {
          ...state.threads,
          [agentId]: { ...prev, error, isStreaming: false },
        },
      };
    }),

  setStreaming: (agentId, streaming) =>
    set((state) => {
      const prev = state.threads[agentId] ?? EMPTY_THREAD;
      return {
        threads: { ...state.threads, [agentId]: { ...prev, isStreaming: streaming } },
      };
    }),

  setHistory: (agentId, turns) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [agentId]: { turns, isStreaming: false, error: null },
      },
    })),

  clearThread: (agentId) =>
    set((state) => ({
      threads: { ...state.threads, [agentId]: { ...EMPTY_THREAD } },
    })),
}));
