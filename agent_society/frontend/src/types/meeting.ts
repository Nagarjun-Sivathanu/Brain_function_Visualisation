// Stages of the brain-meeting flow.
export type MeetingStage =
  | "assessment"
  | "recruitment"
  | "round1"
  | "round2"
  | "voting"
  | "implementation"
  | "final";

export type VotePosition = "for" | "against" | "abstain";
export type EdgeKind = "excitatory" | "inhibitory" | "modulatory" | "gating";

export interface Meeting {
  id: string;
  scenario: string;
  status: "pending" | "running" | "complete";
  created_at: string;
  result_summary: string | null;
  name?: string | null;
  max_level?: number;
}

export interface MeetingMessage {
  id: number;
  meeting_id: string;
  agent_id: string;
  agent_name: string;
  agent_role: string;
  stage: MeetingStage;
  content: string;
  created_at: string;
  emoji: string;
  color: string;
}

export interface Vote {
  agent_id: string;
  agent_name: string;
  agent_role: string;
  position: VotePosition;
  confidence: number;
  reasoning: string;
  emoji: string;
  color: string;
}

// Every event carries a monotonic seq + ms-since-start, so the whole UI is a
// pure function of the event log (enables replay + terminal view + memory states).
interface Timed {
  seq?: number;
  t_ms?: number;
}

export type SseEvent = Timed &
  (
    | { type: "meeting_started"; scenario: string; max_level: number }
    | { type: "stage_change"; stage: MeetingStage }
    | { type: "seat"; agent_id: string; room: string; seat: string; index: number }
    | { type: "assess"; agent_id: string; picks: { region: string; confidence: number; involved: boolean; reason: string }[] }
    | { type: "summon"; agent_id: string; caller_id: string; reason: string }
    | { type: "move"; agent_id: string; room: string }
    | { type: "agent_start"; agent_id: string; stage: MeetingStage }
    | { type: "token"; agent_id: string; text: string }
    | { type: "agent_end"; agent_id: string }
    | { type: "contribution"; agent_id: string; text: string; handles: string[] }
    | { type: "edge"; from: string; to: string; kind: EdgeKind; note: string }
    | { type: "flow_proposal"; ordering: string[]; rationale: string }
    | { type: "vote"; agent_id: string; position: VotePosition; confidence: number; reasoning: string }
    | { type: "merge"; merged_id: string; left_id: string; right_id: string; label: string }
    | { type: "implement"; agent_id: string; order: number; text: string }
    | { type: "final_answer"; text: string; by: string }
    | { type: "memory_saved"; memory_id: number; name: string }
    | { type: "phase_paused"; completed_stage: MeetingStage; next_stage: MeetingStage }
    | { type: "interjection"; content: string }
    | { type: "error"; meeting_id: string; message: string }
    | { type: "meeting_end"; meeting_id: string }
  );
