import { create } from "zustand";
import type { MeetingStage, SseEvent, VotePosition } from "@/types/meeting";

export interface LiveMessage {
  key: string;
  agentId: string;
  stage: MeetingStage;
  text: string;
  done: boolean;
  order: number;
}

export interface LiveVote {
  agentId: string;
  position: VotePosition;
  confidence: number;
  reasoning: string;
}

export interface Interjection {
  id: string;
  content: string;
  /** The stage that had just completed when this interjection was added. */
  afterStage: MeetingStage | null;
}

interface MeetingState {
  meetingId: string | null;
  scenario: string | null;
  status: "idle" | "running" | "paused" | "complete" | "error";
  currentStage: MeetingStage | null;
  messages: LiveMessage[];
  votes: LiveVote[];
  summary: string;
  errorText: string | null;
  /** Agents currently generating tokens (between agent_start and agent_end). */
  speakingAgentIds: string[];
  /** When paused, the stage that just finished + what's next. */
  pausedAfterStage: MeetingStage | null;
  pausedNextStage: MeetingStage | null;
  /** Past interjections (rendered inline in the chat). */
  interjections: Interjection[];
  /** True if this meeting was started with the agent-tool-use flag. The
   *  header subtitle uses this to show a "🔧 tools on" badge so the user
   *  remembers what mode they're in. */
  enableTools: boolean;
  /** True if this meeting was started with Observer context injection. */
  includeObserverContext: boolean;

  startMeeting: (
    id: string,
    scenario: string,
    enableTools?: boolean,
    includeObserverContext?: boolean,
  ) => void;
  applyEvent: (event: SseEvent) => void;
  failMeeting: (msg: string) => void;
  resetMeeting: () => void;
}

const messageKey = (agentId: string, stage: MeetingStage) => `${agentId}:${stage}`;

export const useMeetingStore = create<MeetingState>((set) => ({
  meetingId: null,
  scenario: null,
  status: "idle",
  currentStage: null,
  messages: [],
  votes: [],
  summary: "",
  errorText: null,
  speakingAgentIds: [],
  pausedAfterStage: null,
  pausedNextStage: null,
  interjections: [],
  enableTools: false,
  includeObserverContext: false,

  startMeeting: (id, scenario, enableTools = false, includeObserverContext = false) =>
    set({
      meetingId: id,
      scenario,
      status: "running",
      currentStage: null,
      messages: [],
      votes: [],
      summary: "",
      errorText: null,
      speakingAgentIds: [],
      pausedAfterStage: null,
      pausedNextStage: null,
      interjections: [],
      enableTools,
      includeObserverContext,
    }),

  applyEvent: (event) =>
    set((state) => {
      switch (event.type) {
        case "stage_change":
          // Resume from a pause once the next stage actually starts
          return {
            currentStage: event.stage,
            status: state.status === "paused" ? "running" : state.status,
            pausedAfterStage: null,
            pausedNextStage: null,
          };

        case "phase_paused":
          return {
            status: "paused",
            pausedAfterStage: event.completed_stage,
            pausedNextStage: event.next_stage,
          };

        case "interjection":
          return {
            interjections: [
              ...state.interjections,
              {
                id: `int-${state.interjections.length}-${Date.now()}`,
                content: event.content,
                afterStage: state.pausedAfterStage,
              },
            ],
          };

        case "agent_start": {
          const key = messageKey(event.agent_id, event.stage);
          const speaking = state.speakingAgentIds.includes(event.agent_id)
            ? state.speakingAgentIds
            : [...state.speakingAgentIds, event.agent_id];
          if (state.messages.some((m) => m.key === key)) {
            return { speakingAgentIds: speaking };
          }
          return {
            speakingAgentIds: speaking,
            messages: [
              ...state.messages,
              {
                key,
                agentId: event.agent_id,
                stage: event.stage,
                text: "",
                done: false,
                order: state.messages.length,
              },
            ],
          };
        }

        case "token": {
          // Append to the latest non-done message for this agent
          const idx = [...state.messages]
            .map((m, i) => ({ m, i }))
            .reverse()
            .find(({ m }) => m.agentId === event.agent_id && !m.done)?.i;
          if (idx === undefined) return state;
          const next = state.messages.slice();
          next[idx] = { ...next[idx], text: next[idx].text + event.text };
          return { messages: next };
        }

        case "agent_end": {
          const speaking = state.speakingAgentIds.filter((id) => id !== event.agent_id);
          const idx = [...state.messages]
            .map((m, i) => ({ m, i }))
            .reverse()
            .find(({ m }) => m.agentId === event.agent_id && !m.done)?.i;
          if (idx === undefined) {
            return { speakingAgentIds: speaking };
          }
          const next = state.messages.slice();
          next[idx] = { ...next[idx], done: true };
          const updates: Partial<MeetingState> = { messages: next, speakingAgentIds: speaking };
          if (event.agent_id === "system") {
            updates.summary = next[idx].text;
          }
          return updates;
        }

        case "vote":
          return {
            votes: [
              ...state.votes.filter((v) => v.agentId !== event.agent_id),
              {
                agentId: event.agent_id,
                position: event.position,
                confidence: event.confidence,
                reasoning: event.reasoning,
              },
            ],
          };

        case "error":
          return {
            status: "error",
            errorText: event.message,
            currentStage: null,
          };

        case "meeting_end":
          // don't downgrade error → complete
          if (state.status === "error")
            return {
              currentStage: null,
              speakingAgentIds: [],
              pausedAfterStage: null,
              pausedNextStage: null,
            };
          return {
            status: "complete",
            currentStage: null,
            speakingAgentIds: [],
            pausedAfterStage: null,
            pausedNextStage: null,
          };

        default:
          return state;
      }
    }),

  failMeeting: (msg) => set({ status: "error", errorText: msg }),

  resetMeeting: () =>
    set({
      meetingId: null,
      scenario: null,
      status: "idle",
      currentStage: null,
      messages: [],
      votes: [],
      summary: "",
      errorText: null,
      speakingAgentIds: [],
      pausedAfterStage: null,
      pausedNextStage: null,
      interjections: [],
      enableTools: false,
      includeObserverContext: false,
    }),
}));

export const STAGE_LABELS: Record<MeetingStage, string> = {
  initial_opinions: "Initial Opinions",
  critique_round: "Critique",
  refinement_round: "Refinement",
  voting: "Voting",
  consensus_summary: "Consensus",
};

export const STAGE_ORDER: MeetingStage[] = [
  "initial_opinions",
  "critique_round",
  "refinement_round",
  "voting",
  "consensus_summary",
];
