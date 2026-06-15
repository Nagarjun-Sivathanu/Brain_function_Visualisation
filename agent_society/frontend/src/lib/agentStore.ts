import { create } from "zustand";
import type { Agent, AgentStatus } from "@/types/agent";
import { type RoomId, roomSlot, panelSeat, audienceSeat, registerAgentOrder } from "@/lib/officeLayout";

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
  // Arrival-ordered membership per room — drives main-seat vs ring slotting.
  roomMembers: Record<RoomId, string[]>;
  selectedAgentId: string | null;
  hoveredAgentId: string | null;

  setAgents: (agents: Agent[]) => void;
  setStatus: (agentId: string, status: AgentStatus) => void;
  setStatusAll: (status: AgentStatus) => void;
  setAgentPosition: (agentId: string, pos: AgentPosition) => void;
  setWalking: (agentId: string, walking: boolean) => void;
  placeInRoom: (agentId: string, room: RoomId) => void;
  moveAgentToRoom: (agentId: string, room: RoomId) => void;
  moveAllTo: (room: RoomId) => void;
  resetPositions: () => void;
  selectAgent: (agentId: string | null) => void;
  hoverAgent: (agentId: string | null) => void;
}

const EMPTY_ROOMS = (): Record<RoomId, string[]> => ({ waiting: [], meeting: [], implementation: [] });

type LevelOf = (id: string) => number;

/** Recompute even positions for every agent in a room from its membership order.
 *  The meeting room is a conference panel: level-2 divisions take the executive
 *  panel seats (by their order among divisions) and everyone else fills the
 *  audience rows facing them — independent of arrival order, so divisions keep
 *  their head-table seat after stepping out and back. */
function layoutRoom(members: string[], room: RoomId, positions: Record<string, AgentPosition>, levelOf: LevelOf) {
  if (room === "meeting") {
    const panel = members.filter((id) => levelOf(id) === 2);
    const audience = members.filter((id) => levelOf(id) !== 2);
    panel.forEach((id, i) => {
      const p = panelSeat(i);
      positions[id] = { room, lx: p.lx, ly: p.ly };
    });
    audience.forEach((id, i) => {
      const p = audienceSeat(i, audience.length);
      positions[id] = { room, lx: p.lx, ly: p.ly };
    });
    return;
  }
  members.forEach((id, i) => {
    const p = roomSlot(room, i, members.length);
    positions[id] = { room, lx: p.lx, ly: p.ly };
  });
}

/** Build a level lookup from an agent list. */
function levelLookup(agents: Agent[]): LevelOf {
  const m = new Map(agents.map((a) => [a.id, a.level]));
  return (id) => m.get(id) ?? 99;
}

function initialState(agents: Agent[]) {
  registerAgentOrder(agents.map((a) => a.id));
  const roomMembers = EMPTY_ROOMS();
  // The level-2 divisions live in the meeting room (seated at their table) from
  // the start; everyone else waits in the corridor until summoned.
  for (const a of agents) {
    (a.level === 2 ? roomMembers.meeting : roomMembers.waiting).push(a.id);
  }
  const positions: Record<string, AgentPosition> = {};
  const levelOf = levelLookup(agents);
  layoutRoom(roomMembers.meeting, "meeting", positions, levelOf);
  layoutRoom(roomMembers.waiting, "waiting", positions, levelOf);
  return {
    agents,
    statuses: Object.fromEntries(agents.map((a) => [a.id, (a.level === 2 ? "meeting" : "idle") as AgentStatus])),
    positions,
    walking: Object.fromEntries(agents.map((a) => [a.id, false])),
    roomMembers,
  };
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  statuses: {},
  positions: {},
  walking: {},
  roomMembers: EMPTY_ROOMS(),
  selectedAgentId: null,
  hoveredAgentId: null,

  setAgents: (agents) => set(initialState(agents)),

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

  // Move an agent into a room, appended in arrival order, and re-flow the rooms
  // it left and joined so everyone stays evenly placed.
  placeInRoom: (agentId, room) =>
    set((state) => {
      const roomMembers: Record<RoomId, string[]> = {
        waiting: [...state.roomMembers.waiting],
        meeting: [...state.roomMembers.meeting],
        implementation: [...state.roomMembers.implementation],
      };
      const left: RoomId[] = [];
      (Object.keys(roomMembers) as RoomId[]).forEach((r) => {
        const idx = roomMembers[r].indexOf(agentId);
        if (idx >= 0 && r !== room) {
          roomMembers[r].splice(idx, 1);
          left.push(r);
        }
      });
      if (!roomMembers[room].includes(agentId)) roomMembers[room].push(agentId);

      const positions = { ...state.positions };
      const levelOf = levelLookup(state.agents);
      layoutRoom(roomMembers[room], room, positions, levelOf);
      left.forEach((r) => layoutRoom(roomMembers[r], r, positions, levelOf));
      return { roomMembers, positions };
    }),

  moveAgentToRoom: (agentId, room) =>
    set((state) => {
      // delegate to placeInRoom semantics inline
      const rm: Record<RoomId, string[]> = {
        waiting: [...state.roomMembers.waiting],
        meeting: [...state.roomMembers.meeting],
        implementation: [...state.roomMembers.implementation],
      };
      (Object.keys(rm) as RoomId[]).forEach((r) => {
        const idx = rm[r].indexOf(agentId);
        if (idx >= 0 && r !== room) rm[r].splice(idx, 1);
      });
      if (!rm[room].includes(agentId)) rm[room].push(agentId);
      const positions = { ...state.positions };
      const levelOf = levelLookup(state.agents);
      (Object.keys(rm) as RoomId[]).forEach((r) => layoutRoom(rm[r], r, positions, levelOf));
      return { roomMembers: rm, positions };
    }),

  moveAllTo: (room) =>
    set((state) => {
      const roomMembers = EMPTY_ROOMS();
      roomMembers[room] = state.agents.map((a) => a.id);
      const positions: Record<string, AgentPosition> = { ...state.positions };
      layoutRoom(roomMembers[room], room, positions, levelLookup(state.agents));
      return { roomMembers, positions };
    }),

  resetPositions: () =>
    set((state) => {
      const s = initialState(state.agents);
      return { positions: s.positions, statuses: s.statuses, roomMembers: s.roomMembers };
    }),

  selectAgent: (agentId) => set({ selectedAgentId: agentId }),
  hoverAgent: (agentId) => set({ hoveredAgentId: agentId }),
}));
