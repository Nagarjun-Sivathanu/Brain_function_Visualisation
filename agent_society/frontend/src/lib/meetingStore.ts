import { create } from "zustand";
import type { MeetingStage, SseEvent, VotePosition, EdgeKind } from "@/types/meeting";
import { useAgentStore } from "@/lib/agentStore";

// ── Derived view (a pure fold of the event log up to a cursor) ──────────────
export interface LiveMessage {
  key: string;
  agentId: string;
  stage: MeetingStage;
  text: string;
  done: boolean;
}
export interface ViewVote {
  position: VotePosition;
  confidence: number;
  reasoning: string;
}
export interface ViewEdge { from: string; to: string; kind: EdgeKind; note: string }
export interface ViewMerge { merged_id: string; left_id: string; right_id: string; label: string }
export interface ViewImplement { agentId: string; order: number; text: string }

export interface MeetingView {
  scenario: string;
  status: "idle" | "running" | "paused" | "complete" | "error";
  currentStage: MeetingStage | null;
  active: string[];
  summons: { agent_id: string; caller_id: string; reason: string }[];
  assessments: Record<string, { region: string; confidence: number; involved: boolean; reason: string }[]>;
  messages: LiveMessage[];
  contributions: { agentId: string; text: string; handles: string[] }[];
  edges: ViewEdge[];
  votes: Record<string, ViewVote>;
  ordering: string[];
  rationale: string;
  merges: ViewMerge[];
  implement: ViewImplement[];
  finalAnswer: string;
  memoryName: string;
  speakingAgentIds: string[];
  pausedAfterStage: MeetingStage | null;
  pausedNextStage: MeetingStage | null;
  interjections: string[];
  errorText: string | null;
}

function freshView(): MeetingView {
  return {
    scenario: "", status: "idle", currentStage: null, active: [], summons: [],
    assessments: {}, messages: [], contributions: [], edges: [], votes: {},
    ordering: [], rationale: "", merges: [], implement: [], finalAnswer: "",
    memoryName: "", speakingAgentIds: [], pausedAfterStage: null, pausedNextStage: null,
    interjections: [], errorText: null,
  };
}

const ROOM_EVENTS = new Set(["seat", "summon", "move"]);

function reduce(events: SseEvent[]): MeetingView {
  const v = freshView();
  const stageOf: Record<string, MeetingStage> = {}; // agent -> stage of its current message

  const ensureMsg = (agentId: string, stage: MeetingStage) => {
    stageOf[agentId] = stage;
    const key = `${agentId}:${stage}`;
    if (!v.messages.find((m) => m.key === key)) {
      v.messages.push({ key, agentId, stage, text: "", done: false });
    }
  };
  const setMsg = (agentId: string, stage: MeetingStage, text: string, done: boolean) => {
    const key = `${agentId}:${stage}`;
    const m = v.messages.find((x) => x.key === key);
    if (m) { m.text = text; m.done = done; }
    else v.messages.push({ key, agentId, stage, text, done });
  };
  const pushActive = (id: string) => { if (!v.active.includes(id)) v.active.push(id); };

  for (const e of events) {
    switch (e.type) {
      case "meeting_started": v.scenario = e.scenario; v.status = "running"; break;
      case "stage_change": v.currentStage = e.stage; v.pausedAfterStage = null; v.pausedNextStage = null; break;
      case "seat": pushActive(e.agent_id); break;
      case "summon": pushActive(e.agent_id); v.summons.push({ agent_id: e.agent_id, caller_id: e.caller_id, reason: e.reason }); break;
      case "assess": v.assessments[e.agent_id] = e.picks; break;
      case "agent_start":
        if (!v.speakingAgentIds.includes(e.agent_id)) v.speakingAgentIds.push(e.agent_id);
        ensureMsg(e.agent_id, e.stage);
        break;
      case "token": {
        const stage = stageOf[e.agent_id];
        if (stage) {
          const m = v.messages.find((x) => x.key === `${e.agent_id}:${stage}`);
          if (m) m.text += e.text;
        }
        break;
      }
      case "agent_end": {
        v.speakingAgentIds = v.speakingAgentIds.filter((x) => x !== e.agent_id);
        const stage = stageOf[e.agent_id];
        if (stage) {
          const m = v.messages.find((x) => x.key === `${e.agent_id}:${stage}`);
          if (m) m.done = true;
        }
        break;
      }
      case "contribution":
        v.contributions.push({ agentId: e.agent_id, text: e.text, handles: e.handles });
        setMsg(e.agent_id, "round1", e.text, true);
        break;
      case "edge": v.edges.push({ from: e.from, to: e.to, kind: e.kind, note: e.note }); break;
      case "flow_proposal": v.ordering = e.ordering; v.rationale = e.rationale; break;
      case "vote": v.votes[e.agent_id] = { position: e.position, confidence: e.confidence, reasoning: e.reasoning }; break;
      case "merge": v.merges.push({ merged_id: e.merged_id, left_id: e.left_id, right_id: e.right_id, label: e.label }); break;
      case "implement": v.implement.push({ agentId: e.agent_id, order: e.order, text: e.text }); break;
      case "final_answer": v.finalAnswer = e.text; break;
      case "memory_saved": v.memoryName = e.name; break;
      case "phase_paused": v.status = "paused"; v.pausedAfterStage = e.completed_stage; v.pausedNextStage = e.next_stage; break;
      case "interjection": v.interjections.push(e.content); break;
      case "error": v.status = "error"; v.errorText = e.message; break;
      case "meeting_end": if (v.status !== "error") v.status = "complete"; v.speakingAgentIds = []; break;
    }
  }
  return v;
}

// ── Office side-effects: replay room-change events to position sprites ───────
function applyRoomEvent(e: SseEvent) {
  const { placeInRoom, setStatus } = useAgentStore.getState();
  if (e.type === "seat" || e.type === "summon") {
    placeInRoom(e.agent_id, "meeting"); setStatus(e.agent_id, "meeting");
  } else if (e.type === "move") {
    placeInRoom(e.agent_id, e.room as "waiting" | "meeting" | "implementation");
    setStatus(e.agent_id, e.room === "waiting" ? "idle" : "meeting");
  }
}

function replayRooms(events: SseEvent[]) {
  useAgentStore.getState().resetPositions();
  for (const e of events) if (ROOM_EVENTS.has(e.type)) applyRoomEvent(e);
}

// ── Store ───────────────────────────────────────────────────────────────────
interface MeetingState {
  meetingId: string | null;
  events: SseEvent[];
  cursor: number;          // number of events applied to the view
  duration: number;        // last event t_ms
  replaying: boolean;
  view: MeetingView;

  startMeeting: (id: string, scenario: string) => void;
  ingest: (e: SseEvent) => void;
  loadEvents: (id: string, events: SseEvent[]) => void;
  replayTo: (cursor: number) => void;
  setReplaying: (on: boolean) => void;
  reset: () => void;
}

export const STAGE_ORDER: MeetingStage[] = [
  "assessment", "recruitment", "round1", "round2", "voting", "implementation", "final",
];
export const STAGE_LABELS: Record<MeetingStage, string> = {
  assessment: "Assessment", recruitment: "Recruitment", round1: "Round 1 · Contribution",
  round2: "Round 2 · Deliberation", voting: "Voting", implementation: "Implementation", final: "Final answer",
};

export const useMeetingStore = create<MeetingState>((set, get) => ({
  meetingId: null,
  events: [],
  cursor: 0,
  duration: 0,
  replaying: false,
  view: freshView(),

  startMeeting: (id, scenario) => {
    useAgentStore.getState().resetPositions();
    const v = freshView();
    v.scenario = scenario;
    v.status = "running";
    set({ meetingId: id, events: [], cursor: 0, duration: 0, replaying: false, view: v });
  },

  ingest: (e) => {
    const { events, replaying } = get();
    const next = [...events, e];
    if (replaying) {
      // Don't disturb the user's scrub position; just keep collecting.
      set({ events: next, duration: e.t_ms ?? get().duration });
      return;
    }
    if (ROOM_EVENTS.has(e.type)) applyRoomEvent(e);
    set({ events: next, cursor: next.length, duration: e.t_ms ?? get().duration, view: reduce(next) });
  },

  loadEvents: (id, evs) => {
    replayRooms(evs);
    const dur = evs.length ? (evs[evs.length - 1].t_ms ?? 0) : 0;
    set({ meetingId: id, events: evs, cursor: evs.length, duration: dur, replaying: false, view: reduce(evs) });
  },

  replayTo: (cursor) => {
    const { events } = get();
    const c = Math.max(0, Math.min(events.length, cursor));
    const slice = events.slice(0, c);
    replayRooms(slice);
    set({ cursor: c, view: reduce(slice) });
  },

  setReplaying: (on) => set({ replaying: on }),

  reset: () => {
    useAgentStore.getState().resetPositions();
    set({ meetingId: null, events: [], cursor: 0, duration: 0, replaying: false, view: freshView() });
  },
}));
