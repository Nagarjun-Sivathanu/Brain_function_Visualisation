import { create } from "zustand";
import type { Agent, AgentStatus } from "@/types/agent";
import { type RoomId, getDefaultLocal, registerAgentOrder } from "@/lib/officeLayout";

export interface AgentPosition {
  room: RoomId;
  lx: number;
  ly: number;
}

interface AgentState {
  agents: Agent[];
  statuses: Record<string, AgentStatus>;
  positions: Record<string, AgentPosition>;
  walking: Record<string, boolean>;
  selectedAgentId: string | null;
  hoveredAgentId: string | null;

  setAgents: (agents: Agent[]) => void;
  setStatus: (agentId: string, status: AgentStatus) => void;
  setStatusAll: (status: AgentStatus) => void;
  setAgentPosition: (agentId: string, pos: AgentPosition) => void;
  setWalking: (agentId: string, walking: boolean) => void;
  moveAgentToRoom: (agentId: string, room: RoomId) => void;
  moveAllTo: (room: RoomId) => void;
  resetPositions: () => void;
  selectAgent: (agentId: string | null) => void;
  hoverAgent: (agentId: string | null) => void;
}

function defaultPositionsFor(agents: Agent[]): Record<string, AgentPosition> {
  // Register the roster first so layout math can place agents by index + total.
  registerAgentOrder(agents.map((a) => a.id));
  const out: Record<string, AgentPosition> = {};
  for (const a of agents) {
    const local = getDefaultLocal(a.id, "desks");
    out[a.id] = { room: "desks", lx: local.lx, ly: local.ly };
  }
  return out;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  statuses: {},
  positions: {},
  walking: {},
  selectedAgentId: null,
  hoveredAgentId: null,

  setAgents: (agents) =>
    set({
      agents,
      statuses: Object.fromEntries(agents.map((a) => [a.id, "idle" as AgentStatus])),
      positions: defaultPositionsFor(agents),
      walking: Object.fromEntries(agents.map((a) => [a.id, false])),
    }),

  setStatus: (agentId, status) =>
    set((state) => ({ statuses: { ...state.statuses, [agentId]: status } })),

  setStatusAll: (status) =>
    set((state) => ({
      statuses: Object.fromEntries(state.agents.map((a) => [a.id, status])),
    })),

  setAgentPosition: (agentId, pos) =>
    set((state) => ({ positions: { ...state.positions, [agentId]: pos } })),

  setWalking: (agentId, walking) =>
    set((state) => ({ walking: { ...state.walking, [agentId]: walking } })),

  moveAgentToRoom: (agentId, room) =>
    set((state) => {
      const local = getDefaultLocal(agentId, room);
      return {
        positions: { ...state.positions, [agentId]: { room, lx: local.lx, ly: local.ly } },
      };
    }),

  moveAllTo: (room) =>
    set((state) => {
      const positions: Record<string, AgentPosition> = { ...state.positions };
      for (const a of state.agents) {
        const local = getDefaultLocal(a.id, room);
        positions[a.id] = { room, lx: local.lx, ly: local.ly };
      }
      return { positions };
    }),

  resetPositions: () =>
    set((state) => ({
      positions: defaultPositionsFor(state.agents),
      statuses: Object.fromEntries(state.agents.map((a) => [a.id, "idle" as AgentStatus])),
    })),

  selectAgent: (agentId) => set({ selectedAgentId: agentId }),
  hoverAgent: (agentId) => set({ hoveredAgentId: agentId }),
}));
